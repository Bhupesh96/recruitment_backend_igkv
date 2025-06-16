var async = require('async');
var DB_SERVICE = global.DB_SERVICE;

const SHARED_SERVICE = global.SHARED_SERVICE;

let master = {
    getAllMenuByEmpId: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 16
        DB_SERVICE.getQueryDataFromId(dbkey, request, { emp_id: sessionDetails.emp_id }, sessionDetails, function (err, res) {
            if (err) {
                return callback(err);
            }
            else {
                res = res.map(menu => {
                    menu = { ...menu, designation_id: menu['designation_id']?.split(',').map(Number) ?? [] }
                    return menu
                })
                return callback(null, transformMenuData(res));

            }
        })
    },

    getDesignationDetailsByEmpId: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 25;
        if (sessionDetails && sessionDetails.emp_id) {
            params = { emp_id: sessionDetails.emp_id, ...params };
            return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback);
        }
        else {
            return callback({ "message": "No Emp_id" })
        }
    },

    getMenuPermissionDetailsByMenuRoute: function (dbkey, request, params, sessionDetails, callback) {

        if (sessionDetails && sessionDetails.emp_id) {
            params.emp_id = sessionDetails.emp_id;
            let queryObj, queryObj_extraa;
            async.parallel([
                // get query for designation_menu mapping
                function (cback) {
                    sessionDetails.query_id = 28;
                    DB_SERVICE.getQueryFromID(dbkey, params, sessionDetails, function (err, qAndP) {
                        if (err) return cback(err);
                        else if (qAndP) {
                            queryObj = qAndP;
                            return cback();
                        } else {
                            return cback({ message: `no query object recived from getQueryFromID function.` })
                        }
                    });
                },
                // get query emp_menu extraa mapping
                function (cback) {
                    sessionDetails.query_id = 31;
                    DB_SERVICE.getQueryFromID(dbkey, params, sessionDetails, function (err, qAndP) {
                        if (err) return cback(err);
                        else if (qAndP) {
                            queryObj_extraa = qAndP;
                            return cback();
                        } else {
                            return cback({ message: `no query object recived from getQueryFromID function.` })
                        }
                    });
                }
            ], function (err, res) {
                if (err) return callback(err);
                let qAndParamArray = [queryObj, queryObj_extraa]
                DB_SERVICE.executeMultiSelQueriesWithParameters(dbkey, qAndParamArray, function (e1, r1) {
                    if (e1) {
                        return callback(e1);
                    }
                    else if (r1 && r1.data && r1.data.length == 2) {

                        if (r1.data[0].length > 0) {
                            r1.data[0] = r1.data[0].map(e => {
                                e.condition = e['condition']?.split(',') ?? []
                                return e
                            })
                            return callback(null, { "isMenuPermissioned": true, "isExtraaMenuPermissioned": false, data: r1.data[0] })
                        } else if (r1.data[1].length > 0) {
                            r1.data[1] = r1.data[1].map(e => {
                                e.condition = e['condition']?.split(',') ?? []
                                return e
                            })
                            return callback(null, { "isMenuPermissioned": false, "isExtraaMenuPermissioned": true, data: r1.data[1] })
                        } else {
                            return callback(null, { "isMenuPermissioned": false, "isExtraaMenuPermissioned": false, data: [] })
                        }
                    } else {
                        return callback({ message: `something went wrong.` });
                    }
                });
            })
        }
        else {
            return callback({ "message": "No Emp_id" })
        }
    },

   
}
module.exports = master

function transformMenuData(data) {
    const modules = {};
    
    // Group data by module_id and initialize module structure
    data.forEach(item => {
        if (!modules[item.module_id]) {
            modules[item.module_id] = {
                module_id: item.module_id,
                module_name: item.module_name,
                module_icon: item.module_icon,
                module_route: item.module_route,
                module_order_no: item.module_order_no,
                menu: []
            };
        }
    });
    const mainMenus = [];
    const subMenus = {};
    const standaloneMenus = [];

    // Categorize menus 
    data.forEach(item => {
        if (item.children === 1) {
            mainMenus.push(item);
        } else if (item.mainmenuCode) {
            if (!subMenus[item.mainmenuCode]) {
                subMenus[item.mainmenuCode] = [];
            }
            subMenus[item.mainmenuCode].push(item);
        } else {
            standaloneMenus.push(item);
        }
    });

    // Sort and attach submenus to main menus
    mainMenus.forEach(menu => {
        if (subMenus[menu.menuCode]) {
            subMenus[menu.menuCode].sort((a, b) => a.menu_order_no - b.menu_order_no);
            menu.child = subMenus[menu.menuCode];
        } else {
            menu.child = [];
        }
        modules[menu.module_id].menu.push(menu);
    });

    // Add standalone menus (no children and no parent)
    standaloneMenus.forEach(menu => {
        menu.child = [];
        modules[menu.module_id].menu.push(menu);
    });

    // Sort module menus by order
    Object.values(modules).forEach(module => {
        // module.sort((a, b) => a.module_order_no - b.module_order_no);
        module.menu.sort((a, b) => a.menu_order_no - b.menu_order_no);
    });

    return Object.values(modules).sort((a, b) => a.module_order_no - b.module_order_no);
}

