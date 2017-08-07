var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');

var server = http.createServer(function(request, response) {
    console.log('Handling request URL: %s', request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');

    var url = urlUtil.parse(request.url, true);
    console.log("Request is: " + url.pathname);

    if (request.method === 'GET') {
        //var url = urlUtil.parse(request.url);
        var data = queryUtil.parse(url.query);
        console.log(data.message);
        if (!data.message) {
            response.writeHead(400);
        }
        response.end();
    } else if (request.method === 'POST') {
        var requestBody = '';
        request.on('data', function(chunk) {
            requestBody += chunk.toString();
        });
        request.on('end', function() {
            var data = queryUtil.parse(requestBody);
            console.log('we have all the data ', data);
            response.end(data.message);
        });
    } else {
        response.writeHead(405);
        response.end();
    }
});

server.listen(9097);
console.log('listening...');