const fs = require('fs')
const config = require('config');
const PuppeteerHTMLPDF = require('puppeteer-html-pdf');
const handlebars = require('handlebars')
// const template_path = config.get("templated_path")
let { getStuWiseRegCourses, getStudentList, getRegisteredCourseList } = require("./courseService.js");
let { getUniversity, getFeePaidDetailByStudent } = require("./masterService.js")
// let { getStudentAttendanceList } = require("./attendanceService.js");
const { default: axios } = require('axios');
const sharp = require('sharp');
const CONFIG_PARAMS = global.COMMON_CONFS;
const COMMON_SERVICE = global.COMMON_SERVICE;
var async = require('async');
let file_url_pro = config.get("file_url_pro")
let format = require('date-format');
let report_generated_from = config.get('report_generated_from');
// const stream = require('stream');
let FILE_VALIDATOR = require('../validators/fileReportValidator.js');

const pdf_config = {
    format: 'A4',
    margin: {
        left: "25px",
        right: "25px",
        top: "25px",
        bottom: "25px"
    }
}

// ✅ Register custom helpers
handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
    }
});

handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

handlebars.registerHelper('inc', function (value) {
    return parseInt(value, 10) + 1;
});

handlebars.registerHelper("checkValue", function (value) {
    return (value === 0 || value === null || value === "" || value === undefined || value === '0')
        ? "--"
        : value;
});
handlebars.registerHelper("checkOrZeor", function (value) {
    return (value === null || value === "" || value === undefined)
        ? "0"
        : value;
});

handlebars.registerHelper("ifEmpty", function (arr, options) {
    if (!arr || arr.length === 0) {
        return options.fn(this);
    }
    return options.inverse(this);
});

handlebars.registerHelper("times", function (n, block) {
    let accum = "";
    for (let i = 0; i < n; i++) {
        accum += block.fn(i);
    }
    return accum;
});

handlebars.registerHelper("roman", function (number) {
    const map = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    return map[number] || number;
});

// Convert image URL → Base64
async function fetchImageAsBase64Original(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        return `data:${mimeType};base64,${Buffer.from(response.data).toString('base64')}`;
    } catch (err) {
        console.warn(`⚠️ Could not fetch image: ${url}`, err.message);
        return null;
    }
}

async function fetchImageAsBase64(url, maxWidth = 100) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Resize image with sharp
        const resizedBuffer = await sharp(buffer)
            .resize({ width: maxWidth }) // adjust width as needed (e.g., 100px)
            .jpeg({ quality: 60 }) // compress to reduce size
            .toBuffer();

        return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
    } catch (err) {
        console.warn(`⚠️ Could not fetch image: ${url}`, err.message);
        return null;
    }
}

function groupData(data) {
    // Step 1: Group by year → semester → course_id
    const grouped = {};

    data.forEach(item => {
        const year = item.course_year_id;
        const sem = item.semester_id;
        const cid = item.course_id;

        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][sem]) grouped[year][sem] = {};

        // Keep only max repeat_count per course_id
        if (!grouped[year][sem][cid] ||
            grouped[year][sem][cid].repeat_count < item.repeat_count) {
            grouped[year][sem][cid] = item;
        }
    });

    // Step 2: For every year ensure semester 1 & 2 exist
    Object.keys(grouped).forEach(year => {
        for (let sem = 1; sem <= 2; sem++) {

            if (!grouped[year][sem]) {
                // Insert placeholder
                grouped[year][sem] = {
                    placeholder: true,
                    semester_id: sem,
                    course_year_id: parseInt(year),
                    records: []
                };

            } else {
                // Convert course map to array
                let arr = Object.values(grouped[year][sem]);

                // ✅ SORT HERE
                arr.sort((a, b) => {
                    // course_year_id ASC
                    // if (a.course_year_id !== b.course_year_id)
                    //     return a.course_year_id - b.course_year_id;

                    // semester_id DESC
                    // if (a.semester_id !== b.semester_id)
                    //     return b.semester_id - a.semester_id;

                    // course_code ASC
                    // return a.course_code.localeCompare(b.course_code);

                    // course_id DESC
                    if (a.course_id !== b.course_id)
                        return b.course_id - a.course_id;
                });

                grouped[year][sem] = arr;
            }
        }
    });

    return grouped;
}

function convertToSequentialSemesters(grouped) {
    let result = [];
    let semCounter = 1;

    const sortedYears = Object.keys(grouped)
        .map(Number)
        .sort((a, b) => a - b);

    for (const year of sortedYears) {
        const semObj = grouped[year];

        const sortedSems = Object.keys(semObj)
            .map(Number)
            .sort((a, b) => a - b);

        for (const sem of sortedSems) {
            result.push({
                sem_no: semCounter++,   // GLOBAL SEMESTER NUMBER
                year: year,
                courses: Array.isArray(semObj[sem]) ? semObj[sem] : []
            });
        }
    }
    return result;
}


var file = {
    //* done ///////////////// get Student Course Attendance in pdf ////////////////////
    studentAttendanceReportPdf: async function (dbkey, request, params, sessionDetails, callback) {
        // let landscape = params['orientation'] == 'landscape'
        let buffer;
        let pageInfo;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    pageInfo = uniHtml;
                    return cback(null); // Proceed to next step
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 147 };
                const raw_html = fs.readFileSync('assets/templates/academic/course_attendance_report.html', 'utf8');
                sessionDetails = { ...sessionDetails, query_id: 147 };
                let { college_name_e, exam_type_name_e, course_year_name_e, semester_name_e, academic_session_name_e } = params;
                getStuWiseRegCourses(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {

                            let data = res.filter(student =>
                                student.is_finalize_yn === 'Y' &&
                                (student.attendance_status_id !== 0 || student.attendance_status_id !== null)
                            );

                            const info = data[0];
                            const infoData = {
                                college_name: college_name_e,
                                exam_type: exam_type_name_e,
                                course_nature_name_e: info.course_nature_name_e,
                                course_year: course_year_name_e,
                                semester: semester_name_e,
                                course_title_e: info.course_title_e
                            };

                            const infoFields = [
                                { label: 'College Name', valueKey: 'college_name', fullWidth: true },
                                { label: 'Exam Type', valueKey: 'exam_type' },
                                { label: 'Exam Nature', valueKey: 'course_nature_name_e' },
                                { label: 'Course Year', valueKey: 'course_year' },
                                { label: 'Semester', valueKey: 'semester' },
                                { label: 'Course No./Title', valueKey: 'course_title_e', fullWidth: true }
                            ];

                            const tableColumns = [
                                { key: 'index', label: 'SNO.' },
                                { key: 'ue_id', label: 'University ID/ Student ID' },
                                { key: 'student_name', label: 'Name' },
                                { key: 'stu_acad_status_name_e', label: 'Academic Status' },
                                { key: 'appearing_status', label: 'Appearing Status' },
                                { key: 'student_photo_path', label: 'Photo', type: 'image' },
                                { key: 'student_signature_path', label: 'Signature', type: 'image' },
                                { key: 'stu_sign', label: 'Student Signature' },
                                { key: 'inv_sign', label: 'Invigilator Signature' }
                            ];

                            // Group students
                            const grouped = {};
                            let globalIndex = 1;

                            // ✅ Pre-fetch student images
                            for (const student of data) {
                                const key = `${student.degree_programme_id}_${student.course_registration_type_id}`;
                                if (!grouped[key]) {
                                    grouped[key] = {
                                        degree_programme_id: student.degree_programme_id,
                                        degree_programme_name_e: student.degree_programme_name_e,
                                        course_registration_type_id: student.course_registration_type_id,
                                        course_registration_type_name_e:
                                            student.course_registration_type_id === 1 ? 'Regular Students' : 'Repeat Students',
                                        students: []
                                    };
                                }

                                const photoUrl = student.student_photo_path
                                    ? `${file_url_pro}${student.student_photo_path}`
                                    : null;
                                const signUrl = student.student_signature_path
                                    ? `${file_url_pro}${student.student_signature_path}`
                                    : null;

                                const [photoBase64, signBase64] = await Promise.all([
                                    photoUrl ? fetchImageAsBase64(photoUrl) : null,
                                    signUrl ? fetchImageAsBase64(signUrl) : null
                                ]);

                                grouped[key].students.push({
                                    student_name: student.student_name,
                                    ue_id: `${student.ue_id} / ${student.registration_id}`,
                                    stu_acad_status_name_e: student.stu_acad_status_name_e,
                                    appearing_status:
                                        student.attendance_status_id === 1 && student.is_finalize_yn === 'Y'
                                            ? 'PE'
                                            : (student.attendance_status_id === 2 || student.attendance_status_id === 3)
                                                ? 'NP'
                                                : 'NP (Attendance not updated)',
                                    course_registration_type_id: student.course_registration_type_id,
                                    student_photo_path: photoBase64,   // Inject base64
                                    student_signature_path: signBase64, // Inject base64
                                    // index: globalIndex++
                                });
                            }

                            const groupedArray = Object.values(grouped).sort((a, b) => {
                                if (a.degree_programme_id !== b.degree_programme_id) {
                                    return a.degree_programme_id - b.degree_programme_id;
                                }
                                return a.course_registration_type_id - b.course_registration_type_id;
                            });

                            // Sort students inside each group and assign global index
                            groupedArray.forEach(group => {
                                // group.students.sort((a, b) => a.student_name.localeCompare(b.student_name));
                                group.students.forEach(student => {
                                    student.index = globalIndex++;
                                });
                            });

                            // Final context for the template
                            const context = {
                                universityHeading: pageInfo?.universityHeading || `<div></div>`,
                                title: `Examination Attendance Sheet ${academic_session_name_e}`,
                                // water_mark: pageInfo?.water_mark || ""
                                infoFields,
                                infoData,
                                tableColumns,
                                groupedReports: groupedArray
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '5mm', right: '2mm', bottom: '15mm', left: '2mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                // landscape: landscape,
                                landscape: false,
                                // headerTemplate: `<div></div>`,
                                headerTemplate: pageInfo?.border || `<div></div>`,
                                // footerTemplate: pageInfo?.footer || `<div></div>`
                                footerTemplate: `
                                            <div style="font-size:10px; width:100%; padding: 0 25px; color:gray; display:flex; justify-content:space-between;">
                                                <div>Report generated from ${report_generated_from}</div>
                                                <div syle="word-wrap: wrap">* Note : PE- Permitted, NP- Not Permitted</div>
                                                <div>Generated on <span class="date"></span> | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
                                            </div>`
                            };
                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback2(null);
                        } else {
                            return cback2("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    // * done ///////////////// get registration Card Sheet in pdf ////////////////////
    registrationCardSheetPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_VALIDATOR.registrationCardSheet(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        const raw_html = fs.readFileSync('assets/templates/academic/registration_card_sheet.html', 'utf8');
        // let landscape = params['orientation'] == 'landscape';
        let landscape = true;
        let buffer;
        let pageInfo;
        let feeDetails;
        let courseDetails;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, { ...params, landscape }, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    pageInfo = uniHtml;
                    return cback(null); // Proceed to next step
                });
            },
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 222 };
                getFeePaidDetailByStudent(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback1(err, null);
                        if (res && res.length > 0) {
                            feeDetails = res.map((fee) => ({
                                ...fee,
                                trans_datetime: new Date(fee?.trans_datetime)?.toISOString()?.replace('T', ' ')?.replace('Z', '')
                            }))
                            return cback1(null);

                        } else {
                            return cback1("No Fee Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback1({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
            function (cback2) {
                let sessionDetails_2 = { ...sessionDetails, query_id: 156 };
                getRegisteredCourseList(dbkey, request, { ...params, registrationCardsheet: 1 }, sessionDetails_2, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {
                            courseDetails = res.map((course, index) => ({
                                index: index + 1, // For 1-based S.No.
                                course_no: course.course_code, // PLPATH-502
                                course_name: course.course_title_e, // "PLANT VIROLOGY"
                                course_type_name_e: course.course_type_name_e,
                                credit: course?.credit?.split("+")?.reduce((a, b) => Number(a) + Number(b), 0) + "(" + course?.credit + ")",
                                repeat: course.course_type_id === 2 ? 'R' : '',
                                name_of_course_teacher: course.emp_names
                            }));
                            return cback2(null);
                        } else {
                            return cback2("No Course Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
            function (cback3) {
                let sessionDetails_3 = { ...sessionDetails, query_id: 173 };
                getStudentList(dbkey, request, params, sessionDetails_3, async (err, res) => {
                    try {
                        if (err) return cback3(err, null);
                        if (res && res.length > 0) {
                            let student = res[0];

                            let cumulative_sem = (student.course_year_id - 2) * 2 + student.semester_id;
                            let studentDetails = {
                                ue_id: student.ue_id,
                                student_name: student.student_name,
                                registration_id: student.registration_id,
                                academic_session_name_e: student.academic_session_name_e,
                                college_name_e: student.college_name_e,
                                college_id: student.college_id,
                                degree_programme_name_e: student.degree_programme_name_e,
                                course_year_name_e: student.course_year_name_e,
                                semester_name_e: student.semester_name_e,
                                mobile_no: student.mobile_no,
                                category_name: student.category_name,
                                cumulative_sem: cumulative_sem
                            }

                            // Final context for the template
                            const context = {
                                studentDetails,
                                feeDetails,
                                courseDetails,
                                universityHeading: pageInfo?.universityHeading || `<div></div>`,
                                title: `Registration Card Sheet - ${studentDetails.academic_session_name_e}`
                                // water_mark: pageInfo?.water_mark || ""
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '5mm', right: '0mm', bottom: '9mm', left: '0mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                landscape: landscape,
                                headerTemplate: pageInfo?.border || `<div></div>`,
                                footerTemplate: `
                        <div style="font-size:10px; width:100%; padding: 0 25px; color:gray; display:flex; justify-content:space-between;">
                            <div>Report generated from ${report_generated_from}</div>
                            <div syle="word-wrap: wrap"> * This is system generated registration card.
            Office must ensure the submission of registration card as per V.V.Rule. </div>
                            <div>Generated on <span class="date"></span> | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
                        </div>
                        `};
                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback3(null);
                        } else {
                            return cback3("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback3({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    // * done ///////////////// get admit Card in pdf ////////////////////
    admitCardPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_VALIDATOR.admitCard(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        const raw_html = fs.readFileSync('assets/templates/academic/admit_card.html', 'utf8');
        // let landscape = params['orientation'] == 'landscape'
        let buffer;
        let pageInfo;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    pageInfo = uniHtml;
                    return cback(null); // Proceed to next step
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 173 };
                getStudentList(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {
                            let student = res[0];

                            const photoUrl = student.student_photo_path
                                ? `${file_url_pro}${student.student_photo_path}`
                                : null;
                            const signUrl = student.student_signature_path
                                ? `${file_url_pro}${student.student_signature_path}`
                                : null;

                            const [photoBase64, signBase64] = await Promise.all([
                                photoUrl ? fetchImageAsBase64Original(photoUrl) : null,
                                signUrl ? fetchImageAsBase64Original(signUrl) : null
                            ]);

                            let studentDetails = {
                                ue_id: student.ue_id,
                                student_name: student.student_name,
                                registration_id: student.registration_id,
                                student_photo_path: photoBase64,   // Inject base64
                                student_signature_path: signBase64, // Inject base64
                                academic_session_name_e: student.academic_session_name_e,
                                academic_session_id: student.academic_session_id,
                                college_name_e: student.college_name_e,
                                degree_programme_id: student.degree_programme_id,
                                degree_programme_name_e: student.degree_programme_name_e,
                                course_year_id: student.course_year_id,
                                course_year_name_e: student.course_year_name_e,
                                semester_id: student.semester_id,
                                semester_name_e: student.semester_name_e,
                            }
                            // Final context for the template
                            const context = {
                                universityHeading: pageInfo?.universityHeading || `<div></div>`,
                                studentDetails,
                                title: `Regular Examination Admit Card ${studentDetails.academic_session_name_e}`
                                // water_mark: pageInfo?.water_mark || ""
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '5mm', right: '2mm', bottom: '15mm', left: '2mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                // landscape: landscape,
                                landscape: false,
                                // headerTemplate: `<div></div>`,
                                headerTemplate: pageInfo?.border || `<div></div>`,
                                footerTemplate: pageInfo?.footer || `<div></div>`
                            };

                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback2(null);
                        } else {
                            return cback2("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    //* done ///////////////// get registered Courses Report Pdf ////////////////////
    registeredCoursesReportPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const raw_html = fs.readFileSync('assets/templates/academic/registered_courses_report.html', 'utf8');
        // let landscape = params['orientation'] == 'landscape'
        let landscape = true;
        let buffer;
        let pageInfo;
        let studentInfoList;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    pageInfo = uniHtml;
                    return cback(null);
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 147 };
                getStuWiseRegCourses(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    if (err) return cback2(err, null);
                    if (res && res.length > 0) {
                        const groupedByStudent = {};
                        const uniqueCoursesMap = {}; // To track unique courses for frontend

                        res.forEach(item => {
                            const key = item.ue_id;
                            const courseCode = item.course_code;
                            const course_nature_id = item.course_nature_id;

                            // Initialize student if not already grouped
                            if (!groupedByStudent[key]) {
                                const {
                                    registration_id,
                                    ue_id,
                                    student_name,
                                    course_nature_id,
                                    course_nature_name_e,
                                    course_code,
                                    course_id,
                                    course_registration_type_id,
                                    degree_programme_name_e
                                } = item;

                                groupedByStudent[key] = {
                                    student_info: {
                                        registration_id,
                                        ue_id,
                                        student_name,
                                        course_nature_id,
                                        course_nature_name_e,
                                        course_code,
                                        course_id,
                                        course_registration_type_id,
                                        degree_programme_name_e,
                                        coursesMap: {}
                                    }
                                };
                            }

                            const coursesMap = groupedByStudent[key].student_info.coursesMap;
                            if (!coursesMap[courseCode]) {
                                coursesMap[courseCode] = {
                                    course_code: courseCode,
                                    T: null,
                                    P: null
                                };
                            }

                            if (course_nature_id === 1) {
                                coursesMap[courseCode].T = 'R';
                                uniqueCoursesMap[courseCode] ??= { course_code: courseCode, T: null, P: null };
                                uniqueCoursesMap[courseCode].T = 'R';
                            } else if (course_nature_id === 2) {
                                coursesMap[courseCode].P = 'R';
                                uniqueCoursesMap[courseCode] ??= { course_code: courseCode, T: null, P: null };
                                uniqueCoursesMap[courseCode].P = 'R';
                            }
                        });

                        const studentList = Object.values(groupedByStudent).map(studentEntry => {
                            const studentInfo = studentEntry.student_info;
                            studentInfo.courses = Object.values(studentInfo.coursesMap).map(course => {
                                if (course.T === null) delete course.T;
                                if (course.P === null) delete course.P;
                                return course;
                            });
                            delete studentInfo.coursesMap;
                            return studentInfo;
                        });

                        const coursesList = Object.values(uniqueCoursesMap).map(course => {
                            if (course.T === null) delete course.T;
                            if (course.P === null) delete course.P;
                            return course;
                        });

                        studentInfoList = {
                            students: studentList,
                            courses: coursesList,
                            heanders: {
                                college_id: params.college_id,
                                college_name_e: params.college_name_e,
                                degree_programme_name_e: params.degree_programme_name_e,
                                degree_programme_id: params.degree_programme_id,
                                dean_committee_name_e: params.dean_committee_name_e,
                                dean_committee_id: params.dean_committee_id,
                                course_year_id: params.course_year_id,
                                course_year_name_e: params.course_year_name_e,
                                academic_session_name_e: params.academic_session_name_e,
                                semester_name_e: params.semester_name_e,
                            }
                        }
                        cback2(null);
                    } else {
                        return cback2("No Records found", null);
                    }
                });
            },
            function (cback3) {
                (async () => {
                    try {
                        // Info fields
                        const infoFields = [
                            { label: 'College', valueKey: 'college_name_e', fullWidth: true },
                            { label: 'Degree Programme', valueKey: 'degree_programme_name_e' },
                            { label: 'Dean Committee', valueKey: 'dean_committee_name_e' },
                            { label: 'Session', valueKey: 'academic_session_name_e' },
                            { label: 'Year', valueKey: 'course_year_name_e' },
                            { label: 'Semester', valueKey: 'semester_name_e' }
                        ];

                        // Step 1: Group course codes and identify if they have T and/or P
                        const courseColumnMap = {};

                        studentInfoList.courses.forEach(course => {
                            const code = course.course_code;
                            if (!courseColumnMap[code]) {
                                courseColumnMap[code] = { label: code, subColumns: {} };
                            }
                            if (course.T !== undefined) {
                                courseColumnMap[code].subColumns.T = `${code}_T`;
                            }
                            if (course.P !== undefined) {
                                courseColumnMap[code].subColumns.P = `${code}_P`;
                            }
                        });

                        // Step 2: Build table columns with nested structure
                        const tableColumns = [
                            { key: 'index', label: 'S.No.' },
                            { key: 'registration_id', label: 'Registration ID' },
                            { key: 'ue_id', label: 'UE ID' },
                            { key: 'student_name', label: 'Student Name' },
                        ];

                        Object.values(courseColumnMap).forEach(course => {
                            if (course.subColumns.T || course.subColumns.P) {
                                tableColumns.push({
                                    label: course.label,
                                    subColumns: course.subColumns
                                });
                            }
                        });

                        // Step 3: Group students by course_registration_type_id
                        const groupedReportsArray = [];
                        const groupedData = {
                            1: {
                                groupTitle: 'Regular Students',
                                students: []
                            },
                            2: {
                                groupTitle: 'Repeat Students',
                                students: []
                            }
                        };

                        studentInfoList.students.forEach(stu => {
                            const row = {
                                registration_id: stu.registration_id,
                                ue_id: stu.ue_id,
                                student_name: stu.student_name
                            };

                            stu.courses.forEach(c => {
                                if (c.T !== undefined) row[`${c.course_code}_T`] = c.T;
                                if (c.P !== undefined) row[`${c.course_code}_P`] = c.P;
                            });

                            groupedData[stu.course_registration_type_id]?.students.push({
                                ...row,
                                degree_programme_name_e: stu.degree_programme_name_e,
                                course_registration_type_name_e: groupedData[stu.course_registration_type_id].groupTitle,
                                course_registration_type_id: stu.course_registration_type_id
                            });
                        });

                        // Add groups in order: Regular first, Repeat second
                        [1, 2].forEach(id => {
                            if (groupedData[id].students.length > 0) {
                                groupedReportsArray.push({
                                    degree_programme_name_e: groupedData[id].students[0].degree_programme_name_e,
                                    course_registration_type_name_e: groupedData[id].groupTitle,
                                    course_registration_type_id: id,
                                    students: groupedData[id].students
                                });
                            }
                        });

                        // Assign index
                        let currentIndex = 1;
                        groupedReportsArray.forEach(group => {
                            group.students.forEach(student => {
                                student.index = currentIndex++;
                            });
                        });

                        // Compute totalColspan for proper header span
                        let totalColspan = 0;
                        tableColumns.forEach(col => {
                            if (col.subColumns) {
                                totalColspan += (col.subColumns.T ? 1 : 0) + (col.subColumns.P ? 1 : 0);
                            } else {
                                totalColspan += 1;
                            }
                        });
                        totalColspan += 7; // For S.No., Student Name, UE ID

                        // Final context for the template
                        const context = {
                            infoFields,
                            infoData: studentInfoList.heanders,
                            tableColumns,
                            groupedReports: groupedReportsArray,
                            totalColspan,
                            pageInfo,
                            title: params.title,
                            universityHeading: pageInfo?.universityHeading || `<div></div>`,
                        };

                        const compiledTemplate = handlebars.compile(raw_html);
                        const filledTemplate = compiledTemplate(context);

                        const options = {
                            format: 'A4',
                            margin: { top: '5mm', right: '2mm', bottom: '10mm', left: '2mm' },
                            printBackground: true,
                            displayHeaderFooter: true,
                            landscape: landscape,
                            headerTemplate: pageInfo?.border || `<div></div>`,
                            footerTemplate: pageInfo?.footer || `<div></div>`
                        };

                        const htmlPDF = new PuppeteerHTMLPDF();
                        htmlPDF.setOptions(options);
                        buffer = await htmlPDF.create(filledTemplate);

                        cback3(null);  // success
                    } catch (err) {
                        cback3(err);   // on error
                    }
                })();
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    // TODO ///////////////// get SRC Pdf ////////////////////
    semesterReportCardPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_VALIDATOR.semesterReportCardPdf(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        const raw_html = fs.readFileSync('assets/templates/academic/src.html', 'utf8');
        // let landscape = params['orientation'] == 'landscape'
        let clearanceCoursesList = [];
        let regularCoursesList = [];
        let buffer, pageInfo, studentDetails, qrSrc;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    pageInfo = uniHtml;
                    return cback(null); // Proceed to next step
                });
            },
            // * get student details 
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 345 };
                file.getStudentDetailsForSRC(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    if (err) return cback1(err, null);
                    if (res && res.length > 0) {
                        studentDetails = res[0];
                        return cback1(null);
                    } else {
                        return cback1({ message: `Invalid UE ID please provide correct UI ID.` });
                    }
                });
            },
            // & regularCoursesList
            function (cback2) {
                let sessionDetails_2 = { ...sessionDetails, query_id: 346 };
                file.getRegularCoursesListForSRC(dbkey, request, params, sessionDetails_2, (err, res) => {
                    if (err) return cback2(err.message || err);
                    else if (res && res?.length > 0) {
                        regularCoursesList = res.map(row => ({
                            ...row,
                            // tcc: `${row.total_credit}(${row.ct_th + '+' + row.cp}) ${row.credit_nature_short_name_e === 'NC' ? row.credit_nature_short_name_e : ''}`,
                            tcc: `${row.total_credit}(${row.ct_th + '+' + row.cp})${row.credit_nature_short_name_e === 'NC' ? `<span style="font-weight: 600;">NC</span>` : ''}`,
                            grade_point: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? 'S' : row.grade_point,
                            mm_t: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mm_t,
                            mm_p: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mm_p,
                            mp_t: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mp_t,
                            mp_p: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mp_p,
                            mo_t: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mo_t,
                            mo_p: row.grade_sus_t === 'S' || row.grade_sus_p === 'S' ? '--' : row.mo_p,
                            course_title_e: `
                            <p style='font-size: 10px; font-weight: 400;'>${row.course_title_e.toUpperCase()}</p>
                            ${row.thesis_title ? '<p style="font-size: 10px;"> Title:- ' + row.thesis_title + '</p>' : ''}
                            ${row.date_of_viva ? '<p style="font-size: 10px;">Date of Viva-voce:- ' + row.date_of_viva + '</p>' : ''
                                }`
                        }));
                        return cback2(null);
                    } else {
                        return cback2({ message: `Invalid UE ID please provide correct UI ID.` });
                    }
                })
            },
            // & clearanceCoursesList
            function (cback3) {
                let sessionDetails_3 = { ...sessionDetails, query_id: 347 };
                file.getRepeatCoursesListForSRC(dbkey, request, params, sessionDetails_3, (err, res) => {
                    if (err) return cback3(err.message || err);
                    else if (res && res?.length > 0) {
                        clearanceCoursesList = res.map(row => ({
                            ...row,
                            tcc: `${row.total_credit}(${row.ct_th + '+' + row.cp})`,
                            course_title_e: row.course_title_e.toUpperCase()
                        }));
                        return cback3(null);
                    } else {
                        // return cback3({ message: `Invalid UE ID please provide correct UI ID.` });
                        return cback3(null);
                    }
                })
            },
            // ? generate QR code 
            function (cback4) {
                let qrInfo = `
                  ${pageInfo.university_name_e} ${pageInfo.address_e},
                  Name: ${studentDetails.student_name},
                  Session: ${studentDetails.academic_session_name_e},
                  University ID: ${studentDetails.ue_id},
                  OGPA: ${studentDetails.ogpa},
                  Degree: ${studentDetails.degree},
                  Class: ${studentDetails.course_year_name_e}, 
                  Semester: ${studentDetails.semester_name_e}
                `
                COMMON_SERVICE.generateQrCode(qrInfo, function (err, imgBuffer) {
                    if (err) return cback4(err);

                    // Convert PNG buffer → Base64 string for HTML img tag
                    qrSrc = `data:image/png;base64,${imgBuffer.toString('base64')}`;

                    return cback4(null);
                });
            },
            async function (cback5) {
                try {
                    const photoUrl = studentDetails.student_photo
                        ? `${file_url_pro}${studentDetails.student_photo}`
                        : null;

                    const [photoBase64] = await Promise.all([
                        photoUrl ? fetchImageAsBase64(photoUrl) : null
                    ]);

                    // Final context for the template
                    const context = {
                        universityHeading: pageInfo?.universityHeading || `<div></div>`,
                        studentDetails: { ...studentDetails, student_photo_path: photoBase64 },
                        regularCoursesList,
                        clearanceCoursesList,
                        qrSrc,
                        title: `SEMESTER REPORT CARD`
                        // water_mark: pageInfo?.water_mark || ""
                    };

                    const compiledTemplate = handlebars.compile(raw_html);
                    const filledTemplate = compiledTemplate(context);

                    // PDF Options
                    const options = {
                        format: 'A4',
                        margin: { top: '2mm', right: '2mm', bottom: '2mm', left: '2mm' },
                        printBackground: true,
                        displayHeaderFooter: true,
                        landscape: false,
                        // headerTemplate: pageInfo?.border || `<div></div>`,
                        //         headerTemplate: `<div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; box-sizing: border-box; border: 5px double #999;
                        // width: calc(100% - 20px); height: calc(100% - 20px); margin: 0; z-index: 9999; left: 2px; top: 2px;"></div>`,
                        // footerTemplate: pageInfo?.footer || `<div></div>`
                        headerTemplate: `<div></div>`,
                        footerTemplate: `<div></div>`
                    };
                    const htmlPDF = new PuppeteerHTMLPDF();
                    htmlPDF.setOptions(options);
                    buffer = await htmlPDF.create(filledTemplate);
                    // return cback5(null);
                } catch (error) {
                    console.error('❌ PDF generation failed:', error);
                    // return cback5({ err: `PDF generation failed - ${error.message}` }, null);
                }
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    transcriptPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_VALIDATOR.transcriptPdf(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        const raw_html = fs.readFileSync('assets/templates/academic/transcript.html', 'utf8');
        // let landscape = params['orientation'] == 'landscape'
        let buffer;
        let university, student, qrSrc, courses;
        let { ue_id, degree_programme_id } = params
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                COMMON_SERVICE.getUniversityHeading(dbkey, request, params, sessionDetails_0, function (err, uniHtml) {
                    if (err) return cback(err.message || err);
                    university = uniHtml;
                    return cback(null);
                });
            },
            // * get student information
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 360 };
                file.getStudentDetailsForTranscript(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    if (err) return cback1(err, null);
                    if (res && res.length > 0) {
                        student = res[0];
                        return cback1(null);
                    } else {
                        return cback1({ message: `No Record found, Invalid UE ID.` });
                    }
                });
            },
            // ? generate QR code
            function (cback2) {
                let qrInfo = `
                  ${university.university_name_e} ${university.address_e},
                  Name: ${student.student_name},
                  Period of Student-ship: ${student.admission_session} to ${student.degree_completed_session},
                  University ID: ${student.ue_id},
                  Degree Programme: ${student.degree},
                  OGPA: ${student.ogpa},
                  Result: ${student.division_remark}
                `
                COMMON_SERVICE.generateQrCode(qrInfo, function (err, imgBuffer) {
                    if (err) return cback2(err);
                    // Convert PNG buffer → Base64 string for HTML img tag
                    qrSrc = `data:image/png;base64,${imgBuffer.toString('base64')}`;
                    return cback2(null);
                });
            },
            // & ger courses list 
            function (cback3) {
                file.getCoursesListForTranscript(dbkey, request, params, { ...sessionDetails, query_id: 361 }, async (err, res) => {
                    if (err) return cback3(err, null);
                    if (res && res?.length > 0) {
                        let tempData = res.map(row => ({
                            ...row,
                            // tcc: `${row.total_credit}(${row.ct_th + '+' + row.cp}) ${row.credit_nature_short_name_e === 'NC' ? row.credit_nature_short_name_e : ''}`,
                            tcc: `${row.total_credit}(${row.ct_th + '+' + row.cp})${row.credit_nature_short_name_e === 'NC' ? `<span>NC</span>` : ''}`,
                            // grade_point: row.credit_nature_short_name_e === 'NC' || row.credit_nature_short_name_e === 'C' ? 'S' : row.grade_point,
                            mm_t: row.credit_nature_short_name_e === 'NC' || row.mm_t === 0 ? '--' : row.mm_t,
                            mm_p: row.credit_nature_short_name_e === 'NC' || row.mm_p === 0 ? '--' : row.mm_p,
                            // mp_t: row.credit_nature_short_name_e === 'NC' || row.credit_nature_short_name_e === 'C' ? '--' : row.mp_t,
                            // mp_p: row.credit_nature_short_name_e === 'NC' || row.credit_nature_short_name_e === 'C' ? '--' : row.mp_p,
                            mo_t: row.credit_nature_short_name_e === 'NC' && row.ct_th !== 0 ? 'S' : row.ct_th === 0 ? '--' : row.mo_t,
                            mo_p: row.credit_nature_short_name_e === 'NC' && row.cp !== 0 ? 'S' : row.cp === 0 ? '--' : row.mo_p,
                            course_title_e: `
                            <p style='font-size: 9px; font-weight: 400; margin: 0px !important; padding: 0px !important;'>${row.course_title_e.toUpperCase()}</p>
                            ${row.thesis_title ? '<p style="font-size: 10px; margin: 0px !important; padding: 0px !important;"> Title:- ' + row.thesis_title + '</p>' : ''}
                            ${row.date_of_viva ? '<p style="font-size: 10px; margin: 0px !important; padding: 0px !important;">Date of Viva-voce:- ' + row.date_of_viva + '</p>' : ''
                                }`
                        }));
                        const grouped = groupData(tempData);
                        // console.log("grouped ===> ", grouped);
                        courses = convertToSequentialSemesters(grouped);

                        return cback3(null);
                    } else {
                        return cback3("No Courses found, Invalid UE ID.", null);
                    }
                });
            },
            async function (cback2) {
                const photoUrl = student.student_photo
                    ? `${file_url_pro}${student.student_photo}`
                    : null;
                const [photoBase64] = await Promise.all([
                    photoUrl ? fetchImageAsBase64Original(photoUrl) : null,
                ]);

                let studentDetails = {
                    college_name_e: student.college_name_e,
                    degree_programme_name_e: student.degree_programme_name_e,
                    cirtificate_number: student.certificate_number,
                    student_name: student.student_name?.toUpperCase(),
                    ue_id: student.ue_id,
                    period_of_study: `${student.admission_session} TO ${student.degree_completed_session}`,
                    father_name: student.father_name_e?.toUpperCase(),
                    mother_name: student.mother_name_e?.toUpperCase(),
                    address: student.per_address.toUpperCase(),
                    student_photo_path: photoBase64,   // Inject base64
                    date: format('yyyy-MM-dd', new Date()).toString(),
                    total_credit: student.total_credit,
                    ogpa: student.ogpa,
                    division_remark: student.division_remark
                }
                // Final context for the template
                const context = {
                    universityHeading: university?.universityHeading || `<div></div>`,
                    university_shor_name_e: university?.university_shor_name_e,
                    studentDetails,
                    title: `TRANSCRIPT`,
                    // water_mark: university?.water_mark || "",
                    qrSrc,
                    courses
                };

                const compiledTemplate = handlebars.compile(raw_html);
                const filledTemplate = compiledTemplate(context);

                // PDF Options
                const options = {
                    format: 'A4',
                    margin: { top: '2mm', right: '2mm', bottom: '2mm', left: '2mm' },
                    printBackground: true,
                    displayHeaderFooter: true,
                    // landscape: landscape,
                    landscape: false,
                    headerTemplate: `
                        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; box-sizing: border-box; border: 2px solid #999;
                        width: calc(100% - 10px); height: calc(100% - 10px); margin: 0; z-index: 9999; left: 5px; top: 5px;"></div>
                    `,
                    // headerTemplate: pageInfo?.border || `<div></div>`,
                    footerTemplate: `<div></div>`
                };

                const htmlPDF = new PuppeteerHTMLPDF();
                htmlPDF.setOptions(options);
                buffer = await htmlPDF.create(filledTemplate);
                // return cback2(null);
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    provisionalDegreeCertificatePdf: async function (dbkey, request, params, sessionDetails, callback) {
        const { error } = FILE_VALIDATOR.provisionalDegreeCertificatePdf(params);
        if (error) {
            callback({ message: `Validation Error: ${error.details[0].message}` });
            return;
        }
        const raw_html = fs.readFileSync('assets/templates/academic/pdc.html', 'utf8');
        let logoBase64 = fs.readFileSync("assets/images/logo.png", 'base64');
        let logoSrc = `data:image/png;base64,${logoBase64}`;

        let buffer;
        let university, student, qrSrc;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                getUniversity(dbkey, request, params, sessionDetails_0, function (err, res) {
                    if (err) return cback(err);
                    if (res && res.length > 0) {
                        university = res[0];
                        cback(null);
                    } else {
                        return cback("No University Records found");
                    }
                });
            },
            // * get student information
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 358 };
                file.getStudentDetailsForPDC(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    if (err) return cback1(err, null);
                    if (res && res.length > 0) {
                        student = res[0];
                        return cback1(null);
                    } else {
                        return cback1({ message: `No Records found` });
                    }
                });
            },
            // ? generate QR code
            function (cback2) {
                let qrInfo = `
                  ${university.university_name_e} ${university.address_e},
                  Certificate Number: ${student.certificate_number}
                  Name: ${student.student_name},
                  Session: ${student.degree_complt_sess},
                  University ID: ${student.ue_id},
                  OGPA: ${student.ogpa},
                  Degree Programme: ${student.degree}
                `
                COMMON_SERVICE.generateQrCode(qrInfo, function (err, imgBuffer) {
                    if (err) return cback2(err);
                    // Convert PNG buffer → Base64 string for HTML img tag
                    qrSrc = `data:image/png;base64,${imgBuffer.toString('base64')}`;

                    return cback2(null);
                });
            },
            async function (cback3) {
                try {
                    const photoUrl = student.student_photo
                        ? `${file_url_pro}${student.student_photo}`
                        : null;

                    const [photoBase64] = await Promise.all([
                        photoUrl ? fetchImageAsBase64Original(photoUrl) : null,
                    ]);

                    let studentDetails = {
                        student_name_e: student.student_name_e,
                        student_name_h: student.student_name_h,
                        ue_id: student.ue_id, // "110120211043" ||
                        degree_name_h: student.degree_name_h,
                        degree_name_e: student.degree_name_e,
                        // "M.Tech.(Agril. Engg.) (Farm Machinery and Power Engineering)" ||
                        academic_session_name_e: student.degree_complt_sess,
                        certificate_number: student.certificate_number,
                        student_photo_path: photoBase64,   // Inject base64
                        ogpa: student.ogpa,
                        division_h: student.degree_division_h,
                        division_e: student.degree_division_e,
                        date: format('yyyy-MM-dd', new Date()).toString(),
                    }
                    // Final context for the template
                    const context = {
                        studentDetails,
                        university,
                        logoSrc,
                        qrSrc
                    };
                    const compiledTemplate = handlebars.compile(raw_html);
                    const filledTemplate = compiledTemplate(context);
                    // PDF Options
                    const options = {
                        format: 'A4',
                        margin: { top: '5mm', right: '2mm', bottom: '15mm', left: '2mm' },
                        printBackground: true,
                        displayHeaderFooter: true,
                        landscape: false,
                        headerTemplate: `
                                            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; box-sizing: border-box; border: 2px solid #999;
                                            width: calc(100% - 20px); height: calc(100% - 20px); margin: 0; z-index: 9999; left: 10px; top: 10px;"></div>
                                        `,
                        footerTemplate: `<div></div>`
                    };
                    const htmlPDF = new PuppeteerHTMLPDF();
                    htmlPDF.setOptions(options);
                    buffer = await htmlPDF.create(filledTemplate);
                    // return cback3(null);
                } catch (error) {
                    console.error('❌ PDF generation failed:', error);
                    // return cback3({ err: `PDF generation failed - ${error.message}` }, null);
                }
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    migrationCertificatePdf: async function (dbkey, request, params, sessionDetails, callback) {
        const raw_html = fs.readFileSync('assets/templates/academic/migration.html', 'utf8');
        let logoBase64 = fs.readFileSync("assets/images/logo.png", 'base64');
        let logoSrc = `data:image/png;base64,${logoBase64}`;
        // let landscape = params['orientation'] == 'landscape'
        let buffer;
        let university;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                getUniversity(dbkey, request, params, sessionDetails_0, function (err, res) {
                    if (err) return cback(err);
                    if (res && res.length > 0) {
                        university = res[0];
                        cback(null);
                    } else {
                        return cback("No University Records found");
                    }
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 173 };
                getStudentList(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {
                            let student = res[0];

                            let studentDetails = {
                                student_name: student.student_name,
                                father_name: "MANOJ SINGH",
                                ue_id: student.ue_id, // "110120211043" ||
                                degree_programme_name_e: student.degree_programme_name_e,
                                // "M.Tech.(Agril. Engg.) (Farm Machinery and Power Engineering)" ||
                                academic_session_name_e: student.academic_session_name_e,
                                cirtificate_number: 2024254100030,
                                ogpa: 7.81,
                                division_h: "प्रथम श्रेणी",
                                division_e: "First Division",
                                from_date: "2019-20",
                                to_date: "2022-23"
                            }
                            // Final context for the template
                            const context = {
                                studentDetails,
                                university,
                                logoSrc
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '18mm', right: '2mm', bottom: '18mm', left: '2mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                landscape: true,
                                headerTemplate: `<div></div>`,
                                footerTemplate: `<div></div>`
                            };
                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback2(null);
                        } else {
                            return cback2("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    transferCertificatePdf: async function (dbkey, request, params, sessionDetails, callback) {
        const raw_html = fs.readFileSync('assets/templates/academic/tc.html', 'utf8');
        let logoBase64 = fs.readFileSync("assets/images/logo.png", 'base64');
        let logoSrc = `data:image/png;base64,${logoBase64}`;
        // let landscape = params['orientation'] == 'landscape'
        let buffer;
        let university;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                getUniversity(dbkey, request, params, sessionDetails_0, function (err, res) {
                    if (err) return cback(err);
                    if (res && res.length > 0) {
                        university = res[0];
                        cback(null);
                    } else {
                        return cback("No University Records found");
                    }
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 173 };
                getStudentList(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {
                            let student = res[0];

                            let studentDetails = {
                                student_name: student.student_name,
                                father_name: "MANOJ SINGH",
                                ue_id: student.ue_id,
                                degree_programme_name_e: student.degree_programme_name_e,
                                college_name_e: student.college_name_e,
                                cirtificate_number: 2024254100030,
                                ogpa: 7.81,
                                from_date: "2019-20",
                                to_date: "2022-23",
                                date: "21/08/2025",
                                id_no: "20191259",
                                dob: "05/02/2001",
                                dob_in_word: "Fifth February Two Thousand and One",
                                grade: "Good",
                                remark: "He is bearing good moral character and conduct"
                            }
                            // Final context for the template
                            const context = {
                                studentDetails,
                                university,
                                logoSrc
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '5mm', right: '2mm', bottom: '5mm', left: '2mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                landscape: true,
                                headerTemplate: `<div></div>`,
                                footerTemplate: `<div></div>`
                            };
                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback2(null);
                        } else {
                            return cback2("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    feeReceiptPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const raw_html = fs.readFileSync('assets/templates/academic/feeReceipt.html', 'utf8');
        let logoBase64 = fs.readFileSync("assets/images/logo.png", 'base64');
        let logoSrc = `data:image/png;base64,${logoBase64}`;
        // let landscape = params['orientation'] == 'landscape'
        let qrBase64 = fs.readFileSync("assets/images/qr_dummy.png", 'base64');
        let qrSrc = `data:image/png;base64,${qrBase64}`;
        let buffer;
        let university;
        let feeDetails;
        async.series([
            function (cback) {
                let sessionDetails_0 = { ...sessionDetails, query_id: 223 };
                getUniversity(dbkey, request, params, sessionDetails_0, function (err, res) {
                    if (err) return cback(err);
                    if (res && res.length > 0) {
                        university = res[0];
                        cback(null);
                    } else {
                        return cback("No University Records found");
                    }
                });
            },
            function (cback1) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 222 };
                getFeePaidDetailByStudent(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback1(err, null);
                        if (res && res.length > 0) {
                            // let fee = res[0]
                            // feeDetails.fee_purpose_name = fee?.fee_purpose_name;
                            // feeDetails.refferance_no = fee?.refferance_no;
                            // feeDetails.trans_datetime = new Date(fee?.trans_datetime)?.toISOString()?.replace('T', ' ')?.replace('Z', '');
                            // feeDetails.amount = fee?.amount;
                            // feeDetails = res.map((fee) => ({
                            //     ...fee,
                            //     trans_datetime: new Date(fee?.trans_datetime)?.toISOString()?.replace('T', ' ')?.replace('Z', ''),
                            //     title: fee_purpose_name
                            // }))
                            return cback1(null);

                        } else {
                            return cback1("No Fee Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback1({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
            function (cback2) {
                let sessionDetails_1 = { ...sessionDetails, query_id: 173 };
                getStudentList(dbkey, request, params, sessionDetails_1, async (err, res) => {
                    try {
                        if (err) return cback2(err, null);
                        if (res && res.length > 0) {
                            let student = res[0];

                            let studentDetails = {
                                student_name: student.student_name,
                                ue_id: student.ue_id,
                                college_id: "1212100593",
                                college_name_e: student.college_name_e,
                                degree_programme_name_e: student.degree_programme_name_e,
                                // "Ramnivas Sharda College of Agriculture,Ambagarh Chowki,Rajnandgaon" ||
                                course_year_name_e: student.course_year_name_e,
                                semester_name_e: student.semester_name_e,
                                academic_session_name_e: student.academic_session_name_e,
                                receipt_no: "2338",
                                payment_date: "13-11-2021",
                                transaction_no: "IG0000001378158"
                            }

                            let fee_info = {
                                fee_details: [
                                    {
                                        title: "SEMESTER REGISTRATION FEE",
                                        "College Caution Money": 275,
                                        "Enrollment Fees": 55,
                                        "Library Caution Money": 550,
                                        total: 880
                                    },
                                    {
                                        title: "ONE TIME SEMESTER REGISTRATION FEE",
                                        "Tution and Other Fees (include fee like Lab, Library, Medical, College Magazine, Games and Sports, Athletes and Cultural, College Amalgamation Fund etc.)": 7740,
                                        total: 7740
                                    }
                                ],
                                late_fee: 0,
                                paid_amount: 8620,
                                in_word: "Eight Thousand Six Hundred and Twenty Rupee Only",
                                grand_total: 8620
                            }
                            const context = {
                                studentDetails,
                                university,
                                logoSrc,
                                qrSrc,
                                fee_info
                            };

                            const compiledTemplate = handlebars.compile(raw_html);
                            const filledTemplate = compiledTemplate(context);

                            // PDF Options
                            const options = {
                                format: 'A4',
                                margin: { top: '5mm', right: '2mm', bottom: '5mm', left: '2mm' },
                                printBackground: true,
                                displayHeaderFooter: true,
                                landscape: true,
                                headerTemplate: `<div></div>`,
                                footerTemplate: `<div></div>`
                            };
                            const htmlPDF = new PuppeteerHTMLPDF();
                            htmlPDF.setOptions(options);
                            buffer = await htmlPDF.create(filledTemplate);
                            return cback2(null);
                        } else {
                            return cback2("No Records found", null);
                        }
                    } catch (error) {
                        console.error('❌ PDF generation failed:', error);
                        return cback2({ err: `PDF generation failed - ${error.message}` }, null);
                    }
                });
            },
        ], function (err, res) {
            if (err) {
                return callback(err);
            } else {
                return callback(null, buffer);
            }
        });
    },

    // * get Student Details For SRC
    getStudentDetailsForSRC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get Regular Courses List For SRC
    getRegularCoursesListForSRC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get Repeat Courses List For SRC
    getRepeatCoursesListForSRC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get student details for PDC
    getStudentDetailsForPDC: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get student details for Trascript
    getStudentDetailsForTranscript: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

    // * get Courses List For Transcript query_id = 361
    getCoursesListForTranscript: function (dbkey, request, params, sessionDetails, callback) {
        return DB_SERVICE.getQueryDataFromId(dbkey, request, params, sessionDetails, callback)
    },

};

module.exports = file