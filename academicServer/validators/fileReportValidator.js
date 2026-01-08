var joi = require('joi');

let fileValidator = {
    registrationCardSheet: function (reqBody) {
        let schema = joi.object({
            payee_id: joi.number().required(),
            appliedsession: joi.number().required(),
            appliedsemesterid: joi.number().optional(),

            academic_session_id: joi.number().required(),
            course_year_id: joi.number().required(),
            semester_id: joi.number().required(),

            college_id: joi.number().required(),
            degree_programme_id: joi.number().required(),
            ue_id: joi.number().required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    admitCard: function (reqBody) {
        let schema = joi.object({
            academic_session_id: joi.number().required(),
            course_year_id: joi.number().required(),
            semester_id: joi.number().required(),

            college_id: joi.number().required(),
            degree_programme_id: joi.number().required(),
            ue_id: joi.number().required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    feeReceipt: function (reqBody) {
        let schema = joi.object({
            payee_id: joi.number().required(),
            appliedsession: joi.number().required(),
            appliedsemesterid: joi.number().optional(),

            academic_session_id: joi.number().required(),
            course_year_id: joi.number().required(),
            semester_id: joi.number().required(),

            college_id: joi.number().required(),
            degree_programme_id: joi.number().required(),
            ue_id: joi.number().required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    semesterReportCardPdf: function (reqBody) {
        let schema = joi.object({
            src_main_id: joi.number().required(),
            semester_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            exam_type_id: joi.number().required(),
            degree_id: joi.number().required(),
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    provisionalDegreeCertificatePdf: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().required(),
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    transcriptPdf: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().required(),
            degree_programme_id: joi.number().required(),
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    generatePDC: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().optional().allow(null, ''),
            degree_programme_id: joi.number().required(),
            degree_id: joi.number().required(),
            degree_programme_type_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            college_id: joi.number().required(),

            students: joi.array().items(
                joi.object({
                    student_id: joi.number().required(),
                    pdc_gen_yn: joi.string().valid('N').required(),
                    pdc_required: joi.number().optional().allow(null, ''),
                    ue_id: joi.number().required(),
                    degree_completed_session: joi.number().required(),
                    admission_session: joi.number().required(),
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    deletePDC: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().optional().allow(null, ''),
            degree_programme_id: joi.number().required(),
            degree_id: joi.number().required(),
            degree_programme_type_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            college_id: joi.number().required(),

            students: joi.array().items(
                joi.object({
                    student_id: joi.number().required(),
                    pdc_gen_yn: joi.string().valid('Y').required(),
                    pdc_required: joi.number().optional().allow(null, ''),
                    ue_id: joi.number().required(),
                    degree_completed_session: joi.number().required(),
                    admission_session: joi.number().required(),
                    certificate_id: joi.number().required(),
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },
    pdcEsign(reqBody) {
        let schema = joi.object({
            students: joi.array().items(
                joi.object({
                    ue_id: joi.number().required(),
                    degree_programme_id: joi.number().required(),
                    degree_id: joi.number().required(),
                    degree_programme_type_id: joi.number().required(),
                    academic_session_id: joi.number().required(),
                    college_id: joi.number().required(),
                    student_id: joi.number().required(),
                    pdc_gen_yn: joi.string().valid('Y').required(),
                    pdc_required: joi.number().allow(null).optional(null, ''),
                    degree_completed_session: joi.number().required(),
                    certificate_id: joi.number().required(),
                    certificate_number: joi.string().required(),
                    file_path: joi.string().required(),
                    file_name: joi.string().required(),
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    generateTranscript: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().optional().allow(null, ''),
            degree_programme_id: joi.number().required(),
            degree_id: joi.number().required(),
            degree_programme_type_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            college_id: joi.number().required(),

            students: joi.array().items(
                joi.object({
                    student_id: joi.number().required(),
                    transcript_gen_yn: joi.string().valid('N').required(),
                    trascript_required: joi.string().optional().allow(null),
                    ue_id: joi.number().required(),
                    degree_completed_session: joi.number().required(),
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    deleteTranscript: function (reqBody) {
        let schema = joi.object({
            ue_id: joi.number().optional().allow(null, ''),
            degree_programme_id: joi.number().required(),
            degree_id: joi.number().required(),
            degree_programme_type_id: joi.number().required(),
            academic_session_id: joi.number().required(),
            college_id: joi.number().required(),

            students: joi.array().items(
                joi.object({
                    student_id: joi.number().required(),
                    transcript_gen_yn: joi.string().valid('Y').required(),
                    trascript_required: joi.string().optional().allow(null),
                    ue_id: joi.number().required(),
                    degree_completed_session: joi.number().required(),
                    certificate_id: joi.number().required()
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },

    transcriptEsign(reqBody) {
        let schema = joi.object({
            students: joi.array().items(
                joi.object({
                    ue_id: joi.number().required(),
                    degree_programme_id: joi.number().required(),
                    degree_id: joi.number().required(),
                    degree_programme_type_id: joi.number().required(),
                    academic_session_id: joi.number().required(),
                    college_id: joi.number().required(),
                    student_id: joi.number().required(),
                    transcript_gen_yn: joi.string().valid('Y').required(),
                    transcript_required: joi.string().allow(null).optional(),
                    degree_completed_session: joi.number().required(),
                    certificate_id: joi.number().required(),
                    certificate_number: joi.string().required(),
                    file_path: joi.string().required(),
                    file_name: joi.string().required(),
                })
            ).required()
        }).unknown(true);
        return schema.validate(reqBody, { allowUnknown: true });
    },
}



module.exports = fileValidator