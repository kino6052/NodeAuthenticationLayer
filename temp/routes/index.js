
/*
 * GET user login.
 */

exports.index = function(req, res){
  //res.redirect(401, '/login');
  console.log("User: " + req.user);
  if (req.user.google.name){
    res.render('index', { title: 'Index Page', name: req.user.google.name, food: req.user.foodPreference });
  }
  if (req.user.facebook.name){
    res.render('index', { title: 'Index Page', name: req.user.facebook.name });
  }
  
};