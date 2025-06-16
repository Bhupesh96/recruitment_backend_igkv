var Joi = require('joi');

let validators = {
    queryDetailsObjectValidation: function (data, type = 1) {
        let queryObject = {
            query_name: Joi.string().required(),
            module_id: Joi.number().required(),
            is_permission: Joi.number().required(),
            query_object: Joi.object({
                base: Joi.string().required(),
                params: Joi.array().items(Joi.string()).required(),
                permission: Joi.object({
                    A: queryObjectParameterValidation,
                    S: queryObjectParameterValidation,
                    C: queryObjectParameterValidation
                }).allow({}).required(),
                other: Joi.object()
            }).required(),
            base_database: Joi.number().required()
        };
        // insert object
        if (type == 1) {
            queryObject = { ...queryObject }
        }
        //update object
        else if (type == 2) {
            queryObject = { query_id: Joi.number().required(), ...queryObject }
        }

        let schema = Joi.object(queryObject).options({ stripUnknown: true });
        return schema.validate(data, { allowUnknown: true });
    },
    moduleDetailsObjectValidation: function (data, type = 1) {
        let object = {
            module_name: Joi.string().required(),
            module_icon: Joi.string().required(),
            module_route: Joi.string().required(),
            short_name: Joi.string().required(),
            full_name: Joi.string().required(),
            order_no: Joi.number().required(),
        };
        // insert object
        if (type == 1) {
            object = { ...object }
        }
        //update object
        else if (type == 2) {
            object = { module_id: Joi.number().required(), ...object }
        }

        let schema = Joi.object(object).options({ stripUnknown: true });
        return schema.validate(data, { allowUnknown: true });
    },
    menuDetailsObjectValidation: function (data, type = 1) {
        let object = {
            module_name: Joi.string().required(),
            module_icon: Joi.string().required(),
            module_route: Joi.string().required(),
            short_name: Joi.string().required(),
            full_name: Joi.string().required(),
            order_no: Joi.number().required(),
        };
        // insert object
        if (type == 1) {
            object = { ...object }
        }
        //update object
        else if (type == 2) {
            object = { module_id: Joi.number().required(), ...object }
        }

        let schema = Joi.object(object).options({ stripUnknown: true });
        return schema.validate(data, { allowUnknown: true });
    },

    saveComponentDetailsValidation: function (data) {
        let schema = Joi.array().items(
            Joi.object({
                port: Joi.string().required(),
                pathname: Joi.string().required(),
                path: Joi.string().required(),
                component: Joi.string().required()
            }).unknown(true)
        ).required();
        return schema.validate(data, { allowUnknown: true });
    },

    queryOtherParameterObjectValiadation: function (data) {
        return queryObjectParameterValidation.validate(data);
    },
    mapMasterTablesObjectValidation: (object) => {
        const schema = Joi.object({
            db_id: Joi.number().required(),
            table_name: Joi.string().required(),
            map_array: Joi.array().items(Joi.object()).required()
        }).options({ stripUnknown: true });
        return schema.validate(object);
    },
    arrayOfObjectsValidation: (Joi_schema, array) => {
        const schema = Joi.array().items(Joi_schema).required().options({ stripUnknown: true });
        return schema.validate(array);
    },
    apiDetailsObjectValidation: function (data) {
        let object = {
            prefix: Joi.string().required(),
            service_name: Joi.string().required(),
            api_name: Joi.string().required(),
            parameters: Joi.array(),
            query_ids: Joi.array().items(Joi.number()).required(),
            api_creation: Joi.string().required(),
        };
        // insert object
        let schema = Joi.object(object).options({ stripUnknown: true });
        return schema.validate(data, { allowUnknown: true });
    },
    permissionDetailsObjectValidation: function (data) {
        let object = {
            designation_id: Joi.array().items(Joi.number()).required(),
            employee_ids: Joi.array().items(Joi.number()).required(),
            mode: Joi.array().items(Joi.object(({
                page_group_id: Joi.number().required(),
                menuCode: Joi.number().allow(null).required(),
                master_id: Joi.number().required(),
                page_id: Joi.number().required(),
            }))).required(),
            condition: Joi.array().items(Joi.object(({
                page_group_id: Joi.number().required(),
                menuCode: Joi.number().allow(null).required(),
                master_id: Joi.number().required(),
                page_id: Joi.number().required(),
            }))).required(),
            parameter: Joi.array().items(Joi.object(({
                page_group_id: Joi.number().required(),
                parameter: Joi.string().required(),
            }))).required(),
        };
        let schema = Joi.object(object).options({ stripUnknown: true });
        return schema.validate(data, { allowUnknown: true });
    }
}

let queryObjectParameterValidation = Joi.object({
    join: Joi.array().items(Joi.string()).required(),
    select: Joi.string().allow('').required(),
    group: Joi.string().allow('').required(),
    where: Joi.string().allow('').required(),
    params: Joi.array().items(Joi.string()).required()
}).options({ stripUnknown: true }).required();

module.exports = validators
