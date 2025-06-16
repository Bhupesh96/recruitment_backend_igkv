var async = require('async');


let list = {
    getPageDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 24
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) return callback(err);
            if (res.length > 0) {
                if (params.page_id) {
                    let page_details = transformPageData(res)[0]
                    async.parallel([
                        function (cback1) {
                            list.getApiDetailsByPageId(dbkey, request, params, sessionDetails, function (err, apiDetails) {
                                if (err) return cback1(err);
                                page_details['apis'] = apiDetails
                                return cback1()
                            })
                        },
                        function (cback1) {
                            list.getModulePageDetails(dbkey, request, params, sessionDetails, function (err, moduleDetails) {
                                if (err) return cback1(err);
                                page_details['modules'] = moduleDetails
                                return cback1()
                            })
                        }
                    ], function (err, res) {
                        if (err) return callback(err);
                        return callback(null, page_details)
                    })
                } else {
                    return callback(null, transformPageData(res))
                }
            } else {
                return callback(null, [])
            }
        })

    },
    getMenuDetailsList: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 30
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) return callback(err);
            if (res.length > 0) {
                if (params.menuCode) {
                    let menu_details = res[0]
                    async.parallel([
                        function (cback1) {
                            list.getMenuDesignationMappingDetails(dbkey, request, params, sessionDetails, function (err, designationDetails) {
                                if (err) return cback1(err);
                                menu_details['designation_id'] = designationDetails.map(e => { return e.designation_id })
                                return cback1()
                            })
                        },
                        function (cback1) {
                            list.getExtraMenuEmpMappingDetails(dbkey, request, params, sessionDetails, function (err, empDetails) {
                                if (err) return cback1(err);
                                menu_details['emp_id'] = empDetails.map(e => { return e.emp_id })
                                return cback1()
                            })
                        },
                    ], function (err, res) {
                        if (err) return callback(err);
                        return callback(null, menu_details)
                    })
                } else {
                    return callback(null, res)
                }
            } else {
                return callback(null, res)
            }

        })
    },
    getQueryList: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 22
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) return callback(err);
            if (res.length > 0) {
                res.map(element => {
                    element['query_object'] = JSON.parse(element['query_object'])
                });

                return callback(null, res)
            } else {
                return callback(null, res)
            }
        })
    },
    getExtraMenuEmpMappingDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 37
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
            if (err) return callback(err);
            return callback(null, res)
        })
    },
    getMenuDesignationMappingDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 27
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },
    getModulePageDetails: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 36
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    getApiDetailsByPageId: function (dbkey, request, params, sessionDetails, callback) {
        sessionDetails.query_id = 34
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    getSchemaDetailsByTable: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.db_name && params.table_name)) {
            return callback({ message: `db_name and table_name are required` });
        }
        let schemaDetails = [], constraintDetails = [], foreignKeyDetails = [];
        async.series([
            function (cback1) {
                async.parallel([
                    // Fetch schema details
                    function (next) {
                        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, function (err, res) {
                            if (err) return next(err);
                            schemaDetails = res;
                            next();
                        });
                    },
                    // Fetch CHECK constraints
                    function (next) {
                        const query = `
                            SELECT 
                                TRIM(BOTH '\`' FROM SUBSTRING_INDEX(cc.CHECK_CLAUSE, ' ', 1)) AS column_name,
                                SUBSTRING(cc.CHECK_CLAUSE, LOCATE('regexp', cc.CHECK_CLAUSE) + 7) AS regex_pattern
                            FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                            JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
                                ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                                AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                            WHERE tc.TABLE_SCHEMA = '${params.db_name}'
                              AND tc.TABLE_NAME = '${params.table_name}'
                              AND tc.CONSTRAINT_TYPE = 'CHECK'
                              AND cc.CONSTRAINT_SCHEMA = '${params.db_name}';`;

                        DB_SERVICE.executeQueryWithParameters(dbkey, query, [], function (err, res) {
                            if (err) return next(err);
                            constraintDetails = res.data;
                            next();
                        });
                    },
                    // Fetch foreign key info and all referenced table columns
                    function (next) {
                        const query = `
                            SELECT 
                                kcu.COLUMN_NAME,
                                kcu.REFERENCED_TABLE_SCHEMA,
                                kcu.REFERENCED_TABLE_NAME,
                                kcu.REFERENCED_COLUMN_NAME,
                                    COALESCE(
                MAX(CASE WHEN c.COLUMN_COMMENT = 'display_name' THEN c.COLUMN_NAME END),
                MAX(CASE WHEN c.COLUMN_NAME LIKE '%name' THEN c.COLUMN_NAME END)
            ) AS REFERENCED_DISPLAY_COLUMN,
                                GROUP_CONCAT(c.COLUMN_NAME ORDER BY c.ORDINAL_POSITION SEPARATOR ',') AS REFERENCED_TABLE_COLUMNS
                            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                            JOIN INFORMATION_SCHEMA.COLUMNS c
                                ON kcu.REFERENCED_TABLE_SCHEMA = c.TABLE_SCHEMA
                                AND kcu.REFERENCED_TABLE_NAME = c.TABLE_NAME
                            WHERE 
                                kcu.TABLE_SCHEMA = '${params.db_name}'
                                AND kcu.TABLE_NAME = '${params.table_name}'
                                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                            GROUP BY 
                                kcu.CONSTRAINT_NAME,
                                kcu.TABLE_NAME,
                                kcu.COLUMN_NAME,
                                kcu.REFERENCED_TABLE_SCHEMA,
                                kcu.REFERENCED_TABLE_NAME;`;

                        DB_SERVICE.executeQueryWithParameters(dbkey, query, [], function (err, res) {
                            if (err) return next(err);
                            foreignKeyDetails = res.data;
                            next();
                        });
                    }
                ], function (err) {
                    return cback1(err);
                });
            },
            // get max_value for auto_increment column
            function (cback2) {
                let matchIndex = schemaDetails.findIndex(p => p.EXTRA === 'auto_increment');
                if (matchIndex != -1) {
                    let match = schemaDetails[matchIndex];
                    // 
                    // get the max value from the table
                    const query = `SELECT MAX(${match.COLUMN_NAME}) AS max_value FROM ${params.db_name}.${params.table_name}`;
                    DB_SERVICE.executeQueryWithParameters(dbkey, query, [], function (err, res) {
                        if (err) return cback2(err);
                        schemaDetails[matchIndex].COLUMN_DEFAULT = (res.data[0].max_value || 0) + 1;
                        cback2();
                    });
                }
                else {
                    cback2();
                }
            }
        ], function (err, res) {
            if (err) return callback(err);

            // Merge all results into final schemaDetails
            schemaDetails = schemaDetails.map(column => {
                const match = constraintDetails.find(p => p.column_name === column.COLUMN_NAME);
                const fk = foreignKeyDetails.find(p => p.COLUMN_NAME === column.COLUMN_NAME);

                return {
                    ...column,
                    foreign_key_table: fk?.REFERENCED_TABLE_NAME || null,
                    foreign_key_column: fk?.REFERENCED_COLUMN_NAME || null,
                    foreign_key_display_column: fk?.REFERENCED_DISPLAY_COLUMN || null,
                    foreign_key_table_columns: fk?.REFERENCED_TABLE_COLUMNS?.split(',') || null,
                    regex_pattern: match?.regex_pattern?.replace(/^'(.*)'$/, '$1') || null
                };
            });

            callback(null, schemaDetails)
        })

    },
    getRecordsFromTable: function (dbkey, request, params, sessionDetails, callback) {
        let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[params.db_id];
        if (!excuteQueryDbkey) return callback({ message: `base database ${params.db_id} is not mapped with dbkey` })
        // get db details
        let q = `select * from ${params.table_name}`
        DB_SERVICE.executeQueryWithParameters(excuteQueryDbkey, q, [], function (err, res) {
            if (err) { return callback(err) }
            else {
                let records = res.data.map(e => {
                    let newObj = {}
                    Object.keys(e).forEach(key => {
                        if (!exclude_columns.includes(key)) {
                            newObj[key] = e[key]
                        }
                    })
                    return newObj
                })
                return callback(null, records)
            }
        })
    },
    getRecordsFromTableArray: function (dbkey, request, params, sessionDetails, callback) {
        if (!Array.isArray(params.table_name_array) || params.table_name_array.length == 0) {
            return callback({ message: `table_name_array is empty` });
        }
        let excuteQueryDbkey = global.COMMON_CONFS.map_dbkey_database[params.db_id];
        if (!excuteQueryDbkey) return callback({ message: `base database ${params.db_id} is not mapped with dbkey` });

        let queryParamArray = [], table_data = {}
        params.table_name_array.forEach(element => {
            let q = `select ${element.columns.join(',')} from ${element.table_name}`
            queryParamArray.push({ query: q, params: [] })
        });
        DB_SERVICE.executeMultiSelQueriesWithParameters(excuteQueryDbkey, queryParamArray, function (err, res) {
            if (err) {
                return callback({ message: `${err.sqlMessage ?? err}`, code: 'INVALID_QUERY', query: `${err.sql}` });
            } else {
                if (params.table_name_array.length == 1) {
                    table_data[params.table_name_array[0].table_name] = res.data
                } else {
                    res.data.forEach((element, index) => {
                        table_data[params.table_name_array[index].table_name] = element
                    });
                }

            }
            return callback(null, table_data);
        });
    },
    viewQueryDetails: function (dbkey, request, params, sessionDetails, callback) {
        if (!(params.query_id)) return callback({ message: `query_id are required` });
        sessionDetails.query_id = 22
        let response = []
        DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, (err, res) => {
            if (err) return callback(err, null)
            else {
                let result = res[0]
                let query_obj = JSON.parse(result.query_object)
                if (query_obj.other && typeof query_obj.other === 'object' && !Array.isArray(query_obj.other) && Object.keys(query_obj.other).length > 0) {
                    Object.entries(query_obj.other).forEach(([key, value]) => {
                        if (query_obj.permission && typeof query_obj.permission === 'object') {
                            Object.entries(query_obj.permission).forEach(([permKey, permValue]) => {
                                let q = DB_SERVICE.buildQuery(query_obj, permKey, [...query_obj.params, key]);
                                response.push({ q: q?.query, key: key, permission: permKey });
                            });
                        } else {
                            let q = DB_SERVICE.buildQuery(query_obj, '', [...query_obj.params, key]);
                            response.push({ q: q?.query, key: key, permission: '' });
                        }
                    });
                } else {
                    let q = DB_SERVICE.buildQuery(query_obj, '', [...query_obj.params]);
                    response.push({ q: q?.query, key: '', permission: '' });
                }


                return callback(null, response)
            }
        })
    },
    getOperationalDetails: function (dbkey, request, params, sessionDetails, callback) {
        let queryObj, queryObj_extraa;
        async.parallel([
            // get operation 
            function (cback) {
                sessionDetails.query_id = 72;
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
            // get condition
            function (cback) {
                sessionDetails.query_id = 78;
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
                    const combined = [...r1.data[0], ...r1.data[1]];

                    const resultMap = {};

                    combined.forEach(item => {
                        const { page_group_id, page_group_name, master_type, ...rest } = item;
                        if (!resultMap[page_group_id]) {
                            resultMap[page_group_id] = {
                                page_group_id,
                                page_group_name,
                                operation: [],
                                condition: []
                            };
                        }
                        if (master_type === 'page_operation') {
                            resultMap[page_group_id].operation.push({ ...rest, master_type });
                        } else if (master_type === 'page_condition') {
                            resultMap[page_group_id].condition.push({ ...rest, master_type });
                        }
                    });

                    const finalResult = Object.values(resultMap);
                    return callback(null, finalResult)
                } else {
                    return callback({ message: `something went wrong.` });
                }
            });
        })
    },
}


module.exports = list



function transformPageData(data) {
    const groupedData = new Map();

    data.forEach(({ page_id, page_name, page_desc, ...menu }) => {
        if (!groupedData.has(page_id)) {
            groupedData.set(page_id, {
                page_id,
                page_name,
                page_desc,
                menus: new Map()
            });
        }
        if (menu.menuCode) {
            const page = groupedData.get(page_id);
            if (!page.menus.has(menu.menuCode)) {
                page.menus.set(menu.menuCode, {
                    menuCode: menu.menuCode,
                    module_id: menu.module_id,
                    name: menu.name,
                    route: menu.route,
                    icon: menu.icon,
                    menuOrder: menu.menuOrder,
                    is_active: menu.is_active,
                    is_new: menu.is_new,
                    is_display: menu.is_display,
                });
            }
        }

    });

    return Array.from(groupedData.values()).map(page => ({
        ...page,
        menus: Array.from(page.menus.values())
    }));
}

const exclude_columns = [
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
    'created_ip_address',
    'updated_ip_address',
    'updated_dtstamp',
    'created_dtstamp',
    'updated_user_id',
    'created_user_id'

]