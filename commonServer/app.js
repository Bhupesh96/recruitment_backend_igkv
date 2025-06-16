const express = require('express');
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

const staticPath = '/opt/ufp2024/backend/public';
app.use(express.static(staticPath));
app.use('/commonApi24', express.static(staticPath));

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
    return callback(null, global.COMMON_CONFS.getWorkingDBDetails());
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

app.use('/commonApi', express.static('public'))

var initAllFiles = function () {
    global.apiPrefix = '/commonApi';
    global.COMMON_CONFS = require('../commonutils/commonconfs.js').ConfigParams;// call configParams, common configurations are stored here.
    global.DB_SERVICE = require('../commonutils/mysqldbservice.js');
    global.ENCRYPTION_SERVICE = require('../commonutils/encryptionservice.js');
    global.ERROR_SERVICE = require('../commonutils/errorService.js');
    global.COMMON_SECURITY_SERVICE = require('../commonutils/securityservice.js');
    global.SHARED_SERVICE = require('../commonutils/sharedService.js');
    global.SECURITY_SERVICE = require('./services/securityservice.js');
   
    //only init method of all below files are called and pass app.
    require('./routes/securityroutes').init(app);
    require('./routes/commonroutes').init(app);
}

initAllFiles();


module.exports = app;