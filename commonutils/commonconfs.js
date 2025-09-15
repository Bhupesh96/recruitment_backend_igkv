const config = require('config');

var confs = {
    getCommonDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('common_db')));
    },
    getWorkingDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('working_db')));
    },
    getigkv_academic: function () {
        return JSON.parse(JSON.stringify(config.get('igkv_academic')));
    },
    getloginDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('working_db')));
    },
    getigkv_Recruitment: function () {
        return JSON.parse(JSON.stringify(config.get('igkv_Recruitment')));
    },
    getigkv_establishment: function () {
        return JSON.parse(JSON.stringify(config.get('igkv_establishment')));
    },
    getigkv_OnlineExam: function () {
        return JSON.parse(JSON.stringify(config.get('igkv_online_exam')));
    },

}

confs.map_dbkey_database = {
    "7": confs.getigkv_OnlineExam(),
    "4": confs.getigkv_Recruitment(),
    "3": confs.getigkv_establishment(),
    "2": confs.getigkv_academic(),
    "1": confs.getCommonDBDetails()
}





module.exports.ConfigParams = confs;