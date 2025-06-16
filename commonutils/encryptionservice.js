
var bcrypt   = require('bcrypt');
const CryptoJS = require("crypto-js")
const config = require('config')
const encryption_key = config.get('encryption_key')
var encrypt = function(text){
    return bcrypt.hashSync(text);
}

module.exports.decrypt = function(encrpt_data){
    return CryptoJS.AES.decrypt(encrpt_data, encryption_key).toString(CryptoJS.enc.Utf8);//
}
var checkPassword = function(encrypted, nonencrypted, callback){
    bcrypt.compare(nonencrypted, encrypted, function(err, res) {
        if(res === true){
            return callback(null, true);
        }
        else{
            return callback(null, false);
        }
    });
}

module.exports.encrypt = encrypt;
module.exports.checkPassword = checkPassword;
