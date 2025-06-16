const axios = require('axios');


let custom = {
    customApiCall: function (dbkey, request, params, sessionDetails, callback) {
        if (!params.url) return callback({ message: `url and designation is required.` })

        const { url, designation_id } = params
        console.log(url);
        try {
            axiosApiCall(request, { url, designation_id }, function (err, res) {
                callback(err, res)
            })
        } catch (e) {
            console.log(e)
            return callback(e);
        }
    }
}

const axiosApiCall = function (request, data, callback) {
    axios.get(data.url, {
        headers: {
            'x-designation-id': data.designation_id,
            'Content-Type': 'application/json',
            withCredentials: true,
            Cookie: request.headers.cookie
        }
    })
        .then(function (response) {
            callback(null, response.data)
        })
        .catch(function (error) {
            if (error.response) {
                console.log(error.response.data);
                return callback(error.response.data)
            } else {
                // Something happened in setting up the request that triggered an Error
                console.log('Error', error.message);
                return callback({ 'message': error.message })
            }
        });
}

module.exports = custom