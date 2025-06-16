const config = require('config');

var confs = {
    getCommonDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('common_db')));
    },
    getWorkingDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('working_db')));
    },
    getIgkvDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('igkv_db')));
    },
    getloginDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('working_db')));
    },
    getDemoDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('demo_db')));
    },
    getAcadmicDBDetails: function () {
        return JSON.parse(JSON.stringify(config.get('acadmic_db')));
    },

}

confs.map_dbkey_database = {
    "3": confs.getAcadmicDBDetails(),
    "2": confs.getDemoDBDetails(),
    "1": confs.getCommonDBDetails()
}





module.exports.ConfigParams = confs;