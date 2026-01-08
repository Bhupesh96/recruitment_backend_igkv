var joi = require('joi');

let studentProfileValidator = {
    registrationCardSheet: function (reqBody) {
        let schema = joi.object({
            degree_programme_type_id: joi.number().required(),
            degree_programme_id: joi.number().required(),
            subject_id: joi.number().optional().allow(null, ''),
            degree_id: joi.number().required(),
            new_college_id: joi.number().required(),
            old_college_id: joi.number().required(),
            ue_id: joi.number().required(),
            student_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            course_year_id: joi.number().required(),
            semester_id: joi.number().required(),
            university_transfer_order_no: joi.string().required(),
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },
}

module.exports = studentProfileValidator