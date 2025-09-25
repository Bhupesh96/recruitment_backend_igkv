const config = require("config");

var confs = {
  getCommonDBDetails: function () {
    return JSON.parse(JSON.stringify(config.get("common_db")));
  },
  getWorkingDBDetails: function () {
    return JSON.parse(JSON.stringify(config.get("working_db")));
  },
  getigkv_academic: function () {
    return JSON.parse(JSON.stringify(config.get("igkv_academic")));
  },
  getloginDBDetails: function () {
    return JSON.parse(JSON.stringify(config.get("working_db")));
  },
  getigkv_Recruitment: function () {
    return JSON.parse(JSON.stringify(config.get("igkv_Recruitment")));
  },
  getigkv_establishment: function () {
    return JSON.parse(JSON.stringify(config.get("igkv_establishment")));
  },
};

confs.map_dbkey_database = {
  4: confs.getigkv_Recruitment(),
  3: confs.getigkv_establishment(),
  2: confs.getigkv_academic(),
  1: confs.getCommonDBDetails(),
};

module.exports.ConfigParams = confs;
