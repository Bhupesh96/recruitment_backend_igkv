const fs = require('fs')
const config = require('config');
const PuppeteerHTMLPDF = require('puppeteer-html-pdf');
const handlebars = require('handlebars')
const template_path = config.get("templated_path")
// let { getFarmerDetailsForPavtiByFsId } = require('../../fetchServer/services/farmerService.js');
const CONFIG_PARAMS = global.COMMON_CONFS;
l
const pdf_config = {
    format: 'A4',
    margin: {
        left: "25px",
        right: "25px",
        top: "25px",
        bottom: "25px"
    }
}

let file = {
    htmltoPdf: async function (dbkey, request, params, sessionDetails, callback) {
        const raw_html = fs.readFileSync(template_path + 'templates/htmltopdf.html', 'utf8');
        let filledTemplate = handlebars.compile(raw_html);
        filledTemplate = filledTemplate({ html: params['html'] })
        let landscape = params['orientation'] == 'landscape'
        const options = { ...pdf_config, landscape };
        try {
            const htmlPDF = new PuppeteerHTMLPDF();
            await htmlPDF.setOptions(options)
            const buffer = await htmlPDF.create(filledTemplate);
            console.log("PDF Genereated")
            return callback(null, buffer)
        } catch (error) {
            console.log(error)
            return callback({ err: `pdf generation faild - ${error}` }, null)
        }
    },
    // farmerReceipt: async function (dbkey, request, params, sessionDetails, callback) {
    //     const raw_html = fs.readFileSync(template_path + 'templates/farmer_receipt.html', 'utf8');
    //     getFarmerDetailsForPavtiByFsId(dbkey, request, params, sessionDetails, async (err, res) => {
    //         console.log(err, dbkey)
    //         if (err) { return callback(err, null) }
    //         const { basicDetails, landWithCropDetails, registration } = res;
    //         const lands = landWithCropDetails.map(land => {
    //             const pc_crop = land.new_crop.filter(crop => crop.crop_status_code === 3);
    //             const non_pc_crop = land.new_crop.filter(crop => crop.crop_status_code !== 3);
    //             delete land.new_crop
    //             return {
    //                 ...land,
    //                 is_pc: pc_crop.length > 0,
    //                 pc_crop,
    //                 non_pc_crop,
    //                 is_non_pc: non_pc_crop.length > 0
    //             };
    //         });
    //         const is_pc = lands.some((crop) => crop.is_pc == true)
    //         handlebars.registerHelper('eq', (a, b) => a == b);
    //         handlebars.registerHelper('fallback', (value, fallback) => {
    //             return value || fallback;
    //         });
    //         handlebars.registerHelper('entryTypeAllowed', function (code, options) {
    //             return (code == 1 || code == 2) ? options.fn(this) : options.inverse(this);
    //         });

    //         filledTemplate = handlebars.compile(raw_html);
    //         filledTemplate = filledTemplate({ basic: basicDetails, is_pc: is_pc, lands: lands, s: registration })
    //         const options = { ...pdf_config, orientation: 'portrait' };
    //         options.margin = {
    //             left: "15px",
    //             right: "15px",
    //             top: "15px",
    //             bottom: "15px"
    //         }
    //         try {
    //             const start = process.hrtime(); // Get the current high-resolution time
    //             const htmlPDF = new PuppeteerHTMLPDF();
    //             htmlPDF.setOptions(options)
    //             const buffer = await htmlPDF.create(filledTemplate);
    //             console.log('PDF generation successful');
    //             const end = process.hrtime(start); // Get the time elapsed since start
    //             const executionTimeInMs = (end[0] * 1000 + end[1] / 1e6).toFixed(2); // Convert to milliseconds
    //             const executionTimeInSeconds = (end[0] + end[1] / 1e9).toFixed(2); // Convert to seconds
    //             console.log(`Execution time: ${executionTimeInMs} ms`);
    //             console.log(`Execution time: ${executionTimeInSeconds} s`);
    //             callback(null, buffer)
    //         } catch (error) {
    //             console.log(error)
    //             callback({ err: `pdf generation faild - ${error}` }, null)
    //         }
    //     })
    // }
}
module.exports = file