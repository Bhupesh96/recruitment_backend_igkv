module.exports.appStruture = (prefix) => {
    return `const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
var session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const config = require('config');
const app = express();

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(cors({
    credentials: true,
    origin: true,
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));



const limit = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too Many Request',
    standardHeaders: true,
})

app.use(limit);

var getDbKey = function (req, callback) {
    return callback(null, global.COMMON_CONFS.getDemoDBDetails());
}


var option = {
    host: config.get('common_db.host'),
    user: config.get('common_db.user'),
    password: config.get('common_db.password'),
    database: config.get('common_db.database'),
    clearExpired: true,
    // How frequently expired sessions will be cleared; milliseconds:
    checkExpirationInterval: 900000,
    // The maximum age of a valid session; milliseconds:
    expiration: 6 * 60 * 60 * 1000,// 500 second//86400000 one day
    // Whether or not to create the sessions database table, if one does not already exist:
    createDatabaseTable: true,
    // Whether or not to end the database connection when the store is closed.
    // The default value of this option depends on whether or not a connection was passed to the constructor.
    // If a connection object is passed to the constructor, the default value for this option is false.
    endConnectionOnClose: true,
    // Whether or not to disable touch:
    //disableTouch: false,
};


app.use((req, res, next) => {
    getDbKey(req, function (dbkeyErr, dbkey, possibleRootuserId) {
        req.query.dbkey = dbkey;
        next();
    });
})

let sessionStore = new MySQLStore(option);

var session_config = {
    secret: 'secret_key',
    name: 'session',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: false,
        maxAge: 6 * 60 * 60 * 1000, //set the expiry of token to 6hour
        // sameSite: 'none',
        secure: false,
    },
    //rolling: false // Stop session rolling
}


app.use(session(session_config));

if (app.get('env') === 'production') {
    app.set('trust proxy', 1) // trust first proxy
    session_config.cookie.secure = true // serve secure cookies
}



var initAllFiles = function () {
    global.apiPrefix = '/${prefix}'; // this is used to set the prefix for all the routes.
    global.COMMON_CONFS = require('../commonutils/commonconfs.js').ConfigParams;// call configParams, common configurations are stored here.
    global.DB_SERVICE = require('../commonutils/mysqldbservice.js');
    global.ENCRYPTION_SERVICE = require('../commonutils/encryptionservice.js');
    global.ERROR_SERVICE = require('../commonutils/errorService.js');
    global.COMMON_SECURITY_SERVICE = require('../commonutils/securityservice.js');
    global.SHARED_SERVICE = require('../commonutils/sharedService.js');
    global.DOC_UPLOAD_SERVICE = require('../commonutils/fileUploadService.js');
    //only init method of all below files are called and pass app.
    require('./routes/commonroutes').init(app);
}

initAllFiles();
module.exports = app;`
}

module.exports.commonRouteStruture = () => {
    return `var securityService = require('../services/securityservice');
var prefix = global.apiPrefix;
var init = function (app) {
}
module.exports.init = init;`
}

module.exports.serviceStruture = (service_name) => {
    return `var async = require('async');
let ${service_name} = { 
// add service functions here
 
}
module.exports = ${service_name}
`
}

module.exports.routeStruture = (service_name) => {
    return ` 
    app.get(prefix + '/${service_name}/get/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('${service_name}', req.params['function_name'], req, res, req.query, true)
    });
    app.post(prefix + '/${service_name}/post/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('${service_name}', req.params['function_name'], req, res, req.body, true);
    });
    app.delete(prefix + '/${service_name}/delete/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('${service_name}', req.params['function_name'], req, res, req.query, true);
    });
    app.put(prefix + '/${service_name}/update/:function_name', function (req, res, next) {
        securityService.commonFunctionToCall('${service_name}', req.params['function_name'], req, res, req.body, true);
    });
    `
}

module.exports.securityServiceStruture = () => {
    return `let ERROR_SERVICE = global.ERROR_SERVICE;
let COMMON_SECURITY_SERVICE = global.COMMON_SECURITY_SERVICE;

var security = {
    commonFunctionToCall: function (service_name, funcName, req, res, params, ispermreq, resSendCallback) {
        if (noApiPermissionRequiredServices[service_name]?.includes(funcName)) {
            req.noApiPermissionRequired = true;
        }
        COMMON_SECURITY_SERVICE.isAuthorized(req.query.dbkey, req, params, (err, ispermit, sessionDetails) => {
            if (!ispermreq || ispermit) {
                try {
                    if (sessionDetails.api_creation === 'A' && sessionDetails.query_id) {
                        return COMMON_SECURITY_SERVICE.autoApiCall(req.query.dbkey, req, params, sessionDetails, (err, result) => {
                            COMMON_SECURITY_SERVICE.handleServiceResponse(req, err, result, funcName, sessionDetails, res, resSendCallback);
                        });
                    }

                    if (!service_files[service_name]) {
                        return COMMON_SECURITY_SERVICE.sendErrorResponse(COMMON_SECURITY_SERVICE.SECURITY_ERRORS.SERVICE_FILE_NOT_FOUND, res, resSendCallback, 503);
                    }
                    if (!service_files[service_name][funcName]) {
                        return COMMON_SECURITY_SERVICE.sendErrorResponse(COMMON_SECURITY_SERVICE.SECURITY_ERRORS.FUNCTION_NAME_NOT_FOUND, res, resSendCallback, 404);
                    }

                    service_files[service_name][funcName](req.query.dbkey, req, params, sessionDetails, (err, result) => {
                        COMMON_SECURITY_SERVICE.handleServiceResponse(req, err, result, funcName, sessionDetails, res, resSendCallback);
                    });
                } catch (error) {
                    console.error(error);
                    COMMON_SECURITY_SERVICE.sendErrorResponse(COMMON_SECURITY_SERVICE.SECURITY_ERRORS.UNKNOWN_ERROR, res, resSendCallback, 500);
                }
            }else {
                return COMMON_SECURITY_SERVICE.handleAuthorizationError(err, ispermit, sessionDetails, res);
            }
        });
    },
}

let service_files = {
    
}


// no need to check designation_id in header 
// add file and function name here 
let noApiPermissionRequiredServices = {
    
}

module.exports = security
`
}

module.exports.securitySercviceImportStructure = (service_name) => {
    return `let ${service_name} = require('./${service_name}.js');\n`
}
module.exports.serviceFileAddStructure = (service_name,routeName) => {
    return ` "${routeName}" : ${service_name},\n`
}
module.exports.functionStruture = (function_name) => {
    return `${function_name}: function (dbkey, request, params, sessionDetails, callback) {
      // Logic here
      return callback(null, { message: "${function_name} called successfully" });
    },
    `
}

module.exports.wwwFileStruture = (port) => {
    return `#!/usr/bin/env node

var app = require('../app');
var debug = require('debug')('ufp-server');
var http = require('http');
var port = normalizePort('${port}');
app.set('port', port);
var server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log("Server is Listening On Port ", port);
  debug('Listening on ' + bind);
}`
}