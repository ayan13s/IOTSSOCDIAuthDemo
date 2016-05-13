
var express = require('express');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var passport = require('passport');
var Cloudant = require('cloudant');
var request = require('request');
var app = express();

var http_host = (process.env.VCAP_APP_HOST || '0.0.0.0');
var http_port = (process.env.VCAP_APP_PORT || 7000);

app.set('port', http_port);
app.set('host', http_host);

app.use(logger('dev'));
app.use(cookieParser());
app.use(session({
	secret : 'iotfCloud123456789',
	saveUninitialized : true,
	resave : true
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
	done(null, user);
});
passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

// VCAP_SERVICES contains all the credentials of services bound to
// this application. For details of its content, please refer to
// the document or sample of each service.
var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
var ssoConfig = services.SingleSignOn[0];
var client_id = ssoConfig.credentials.clientId;
var client_secret = ssoConfig.credentials.secret;
var authorization_url = ssoConfig.credentials.authorizationEndpointUrl;
var token_url = ssoConfig.credentials.tokenEndpointUrl;
var issuer_id = ssoConfig.credentials.issuerIdentifier;
var callback_url = "https://IOTSSOAyan.mybluemix.net/auth/sso/callback";

var OpenIDConnectStrategy = require('passport-idaas-openidconnect').IDaaSOIDCStrategy;
var Strategy = new OpenIDConnectStrategy({
	authorizationURL : authorization_url,
	tokenURL : token_url,
	clientID : client_id,
	scope : 'openid',
	response_type : 'code',
	clientSecret : client_secret,
	callbackURL : callback_url,
	skipUserProfile : 'false',
	issuer : issuer_id
}, function(iss, sub, profile, accessToken, refreshToken, params, done) {
	process.nextTick(function() {
		profile.accessToken = accessToken;
		profile.refreshToken = refreshToken;
		done(null, profile);
	})
});

var cloudantConfig = services.cloudantNoSQLDB[0];
var cd_user = cloudantConfig.credentials.username;
var cd_password = cloudantConfig.credentials.password;

var cloudant = Cloudant({
	account : cd_user,
	password : cd_password
});

cloudant.db.list(function(err, allDbs) {
	console.log('All my databases: %s', allDbs.join(', '))
});

passport.use(Strategy);
app.get('/login', passport.authenticate('openidconnect', {}));

function ensureAuthenticated(req, res, next) {
	if (!req.isAuthenticated()) {
		req.session.originalUrl = req.originalUrl;
		res.redirect('/login');
	} else {
		return next();
	}
}

app.get('/auth/sso/callback', function(req, res, next) {
	var redirect_url = req.session.originalUrl;
	console.log("callback worked");
	passport.authenticate('openidconnect', {
		successRedirect : '/hello',
		failureRedirect : '/failure',
	})(req, res, next);
});

app.get('/failure', function(req, res) {
	res.send('login failed');
});

app.get('/hello', ensureAuthenticated, function(req, res) {
	var user_email = req.user._json.emailAddress;
	var db = cloudant.db.use("iotdb");
	var html = "";
	html += "<p>Authenticated as user:</p>"
	html += "<pre>" + JSON.stringify(req.user, null, 4) + "</pre>";
	db.get(user_email, function(err, data) {
		console.log("User details from cloudant database :", data);
		html += "<p>User details from cloudant database :</p>"
		html += "<pre>" + JSON.stringify(data, null, 4) + "</pre>";
		res.send(html);
	});
});


app.get('/validateUser', function(req, res) {
	
	console.log("In validate");
	console.log("user -" + JSON.stringify(req.user, null, 4));
	//if request is undefined
	if (typeof req.user == 'undefined' || req.user == null || typeof req.user._json == 'undefined' || req.user._json == null  ){
		res.status(500).json({
			error : 'invalid user'
		});
	}
	var user_email = req.user._json.emailAddress;
	console.log("req.user - " + user_email);
	if (req.isAuthenticated()) {
		var db = cloudant.db.use("iotdb");
		db.get(user_email, function(err, data) {
			console.log("User details from cloudant database :", data);
			res.status(200).json(data);
		});
	} else {
		res.status(500).json({
			error : 'invalid user'
		});

	}
});

var server = app.listen(app.get('port'), app.get('host'), function() {
	console.log('Express server listening on ' + server.address().address + ':'
			+ server.address().port);
});