//error logger
const winston = require('winston');
const { transports, createLogger, format } = require('winston');

const logger = createLogger({
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error', timestamp: true }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

module.exports = logger;