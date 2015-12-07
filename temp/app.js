
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , address = require('./routes/address')
  , user = require('./routes/user')
  , login = require('./routes/login')
  , http = require('http')
  , path = require('path')
  , cookieParser = require('cookie-parser')
  , session = require('express-session')
  , mongoose = require('mongoose')
  , passport = require('passport')
  , User = require('./models/user').User
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy
  , FacebookStrategy = require('passport-facebook').Strategy
  , OAuth2Urls = require('./auth/urls').urls
  , needle = require('needle')
  ;
  
var app = express();

/*
* MONGODB
*/

mongoose.connect('mongodb://localhost:27017/');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));

app.use(session({
  secret: 'secrettexthere',
  saveUninitialized: true,
  resave: true
}));

passport.serializeUser(function(user, done) {
  console.log("[STATUS] Serializing");
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  console.log("[STATUS] Deserializing");
  User.findById(id, function(err, user) {
      
      done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: "116144058942-ubeacp482db65a857umqoae9ar2lufs3.apps.googleusercontent.com",
    clientSecret: "_wQshZFtMvRLjFnAjAVfOwbR",
    callbackURL: "https://nodeauthentication-kino6052.c9.io/auth/google/callback"
  },
  function(token, refreshToken, profile, done) {

        // make the code asynchronous
        process.nextTick(function() {

            // try to find the user based on their google id
            User.findOne({ 'google.id' : profile.id }, function(err, user) {
                if (err)
                    return done(err);

                if (user) {
                    console.log("[STATUS] User is Found (Line 63)");
                    // if a user is found, log them in
                    return done(null, user);
                } else {
                    // if the user isnt in our database, create a new user
                    var newUser          = new User();

                    // set all of the relevant information
                    newUser.google.id    = profile.id;
                    newUser.google.token = token;
                    newUser.google.name  = profile.displayName;
                    //newUser.google.email = profile.emails[0].value; // pull the first email

                    // save the user
                    newUser.save(function(err) {
                        if (err)
                            throw err;
                        return done(null, newUser);
                    });
                }
            });
        });
    }));

/* 
*  FACEBOOK STRATEGY
*/
passport.use(new FacebookStrategy({
    clientID: "207981646200067",
    clientSecret: "db1f9259916e16e94be9e2c6a02fa6de",
    callbackURL: "https://nodeauthentication-kino6052.c9.io/auth/facebook/callback"
  },
  function(token, refreshToken, profile, done) {

        // make the code asynchronous
        // User.findOne won't fire until we have all our data back from Google
        process.nextTick(function() {

            // try to find the user based on their google id
            User.findOne({ 'facebook.id' : profile.id }, function(err, user) {
                if (err)
                    return done(err);

                if (user) {
                    console.log("[STATUS] User is Found (Line 63)");
                    // if a user is found, log them in
                    return done(null, user);
                } else {
                    // if the user isnt in our database, create a new user
                    var newUser          = new User();
                    console.log(profile);
                    // set all of the relevant information
                    newUser.facebook.id    = profile.id;
                    newUser.facebook.token = token;
                    newUser.facebook.name  = profile.displayName;
                    //newUser.google.email = profile.emails[0].value; // pull the first email

                    // save the user
                    newUser.save(function(err) {
                        if (err)
                            throw err;
                        return done(null, newUser);
                    });
                }
            });
        });
    }));


// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());
// in memory login sessions 
app.use(passport.session());
app.use(app.router);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

/*
*  USER HOME PAGE
*
*  Home page is where the user sees
*  their stats.
*  In order to be able to see the stats,
*  user has to log in through google or
*  facebook.
*  Also, the user will have to have an account 
*  with Fitbit and Delivery.com in order
*  to be able to login.
*
*/

app.get('/', isLoggedIn, function(req, res){
  if (!req.user.address){
    res.redirect("/address");
  }
  else if (!req.user.tokens.fitbit.access) { // user is not loged into fitbit account (no refresh token)
    res.redirect(OAuth2Urls.fitbitAuthUrl);
  }
  else if (!req.user.tokens.delivery.access) { // user is not loged into delivery account
    res.redirect(OAuth2Urls.deliveryAuthUrl);
  }
  routes.index(req, res);
});

/*
*  LOGIN PAGE
*/
app.get('/login', login.log);
app.post('/login', routes.index);

/*
*  ADDRESS PAGE
*
*  Where user provides their address
*/
app.get('/address', address.address);

app.post('/preference', isLoggedIn, function(req, res){
  process.nextTick(function(){
    User.update({"facebook.id": req.user.google.id}, {$push: {"foodPreference": req.body.food01}}, function(err){
      if (err) {
        return err;
      }
    });
  });
  res.redirect("/");
});
app.get('/users', user.list);

/*
*  Fitbit Authentication
*/
app.get('/auth/fitbit', function(req, res){
  if (req.query.code){ // about to request tokens
    try{
        console.log(req.query.code); // get the code from the callback url! (how convenient!)
      res.header({
        "Authorization": OAuth2Urls.fitbitHeaders["Authorization"], 
        "Content-Type": OAuth2Urls.fitbitHeaders["Content-Type"] 
      });

      // POSTing from the Server side
      var options = {
        headers: {
          "Authorization": OAuth2Urls.fitbitHeaders["Authorization"], 
          "Content-Type": OAuth2Urls.fitbitHeaders["Content-Type"] 
        }
      };
      needle
        .post(OAuth2Urls.fitbitTokenUrl + req.query.code, {}, options, function(err, resp){
          if (err) {
            res.send(err);
          }
          console.log("[AFTER REQUESTING TOKENS] BODY: " + JSON.stringify(resp.body));
          User.update({"google.id":req.user.google.id}, {$set: {"tokens.fitbit.access": resp.body.access_token}}, function(err){
            res.send(err);
          });
          User.update({"google.id":req.user.google.id}, {$set: {"tokens.fitbit.refresh": resp.body.refresh_token}}, function(err){
            res.send(err);
          });
          
          res.redirect('/');
        }).on('end', function(err, resp){
          if(err){
            res.send(err);
          }
        });
    }
    catch(err){
      res.send(err);
    }
  }
  else { // tokens already requested
    res.send(req.body);
  }
});

// FITBIT GET DATA
app.get("/fitbit/getData", function(req, res){
  needle
    .get("https://api.fitbit.com/1/user/-/profile.json", {headers: {
						"Authorization": "Bearer " + req.user.tokens.fitbit.access
					}}, 
      function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
        });
});

/*
*  Delivery API Helper 
*/

// GET LOCAL MERCHANTS
app.get('/delivery/getLocalMerchants', function(req, res){
  needle
    .get("https://api.delivery.com/merchant/search/delivery?client_id=" + req.query.client_id + "&address=" + req.query.address, 
        function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
        });
});

// GET MENUS FROM MERCHANTS
app.get('/delivery/getMenusFromMerchants', function(req, res){
  needle
    .get("https://api.delivery.com/merchant/" + req.query.merchantId + "/menu?client_id=" + req.query.client_id, 
        function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
        });
});

// GET USER CART
app.get('/delivery/getUserCart', function(req, res){
  res.send(req.user.cart);
});

// GET CART CONTENTS
app.get('/delivery/getCartContents', function(req, res){
  needle
    .get("https://api.delivery.com/customer/cart/" + req.query.merchantId + "?client_id=" + req.query.client_id, {headers: {"Authorization": req.user.tokens.delivery.access}},
        function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
        });
});

// GET PAYMENT METHODS
app.get('/delivery/getPaymentMethods', function(req, res){
  needle
    .get("https://api.delivery.com/customer/cc?client_id=" + req.query.client_id, {headers: {"Authorization": req.user.tokens.delivery.access}},
        function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
        });
});

// ADD ITEM TO CART
app.post('/delivery/addToCart', function(req, res){
   var options = {
        headers: {
          "Authorization": req.user.tokens.delivery.access, 
        }
      };
      needle
        .post("https://api.delivery.com/customer/cart/" + req.body.merchantId, {
                  "order_type": "delivery",
                  "instructions": "",
                  "item": {
                    "item_id": req.body.item.item_id,
                    "item_qty": 1
                  },
                  client_id: "Zjk0YzdhYzg3YTAyZmI1YTFkZjM0OGYyYWQwMDBmYzJl"}, options, function(err, resp){
          if (err) {
            res.send(err);
          }
          res.send(resp.body);
          User.update({"google.id":req.user.google.id}, {$addToSet: {"cart": req.body.merchantId}}, function(err){
            res.send(err);
          });
        }).on('end', function(err, resp){
          if(err){
            res.send(err);
          }
        });
    
});

// PLACE ORDER
app.post('/delivery/placeOrder', function(req, res){
   var options = {
        headers: {
          "Authorization": req.body.headers["Authorization"], 
        }
      };
      needle
        .post("https://api.delivery.com/customer/cart/" + req.body.merchantId + "/checkout", 
                {
                  "tip": req.body.tip,
                  "location_id": req.body.location_id,
                  "uhau_id" : req.body.uhau_id,
                  "instructions": "No instructions.",
                  "payments": req.body.payments,
                  "order_type": "delivery",
                  "order_time": req.body.order_time
                }, options, function(err, resp){
          if (err) {
            res.send(err);
          }
          console.log("[AFTER REQUESTING TOKENS] BODY: " + JSON.stringify(resp.body));
          res.send('Order has been successfully placed!');
        }).on('end', function(err, resp){
          if(err){
            res.send(err);
          }
        });
});

/*
*  Delivery Authentication
*/
app.get('/auth/delivery', function(req, res){
  if (req.query.code){ // about to request tokens
    try{
      // POSTing from the Server side
      var options = {
        
      };
      needle
        .post(OAuth2Urls.deliveryTokenUrl + req.query.code, {}, options, function(err, resp){
          if (err) {
            res.send(err);
          }
          console.log("[AFTER REQUESTING TOKENS] BODY: " + JSON.stringify(resp.body));
          User.update({"google.id":req.user.google.id}, {$set: {"tokens.delivery.access": resp.body.access_token}}, function(err){
            res.send(err);
          });
          User.update({"google.id":req.user.google.id}, {$set: {"tokens.delivery.refresh": resp.body.refresh_token}}, function(err){
            res.send(err);
          });
          
          res.redirect('/');
        }).on('end', function(err, resp){
          if(err){
            res.send(err);
          }
        });
    }
    catch(err){
      res.send(err);
    }
  }
  else { // tokens already requested
    res.send(req.body);
  }
});

/*
*  GOOGLE AUTHENTICATION
*/

app.get('/auth/google',
  passport.authenticate('google', { scope : ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { 
      failureRedirect: '/login',
      successRedirect: '/'
  }));
  
  
/* 
*  FACEBOOK AUTHENTICATION
*/

// Redirect the user to Facebook for authentication.  When complete,
// Facebook will redirect the user back to the application at
//     /auth/facebook/callback
app.get('/auth/facebook', passport.authenticate('facebook'));

// Facebook will redirect the user to this URL after approval.  Finish the
// authentication process by attempting to obtain an access token.  If
// access was granted, the user will be logged in.  Otherwise,
// authentication has failed.
app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { successRedirect: '/',
                                      failureRedirect: '/login' }));
  
app.get('/logout', function(req, res){
  User.update({"google.id": req.user.google.id}, {$set:{"tokens.fitbit.access":""}}, function(err){
    console.log(err);
  });
  User.update({"google.id": req.user.google.id}, {$set:{"tokens.delivery.access":""}}, function(err){
    console.log(err);
  });
  req.logout();
  res.redirect('/login');
});

/*
*  CREATE HTTP SERVER
*/
http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

/* 
*  VARIOUS FUNCTIONS
*/
function isLoggedIn(req, res, next) {
  console.log("isAuthenticated? " + req.isAuthenticated());
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}
