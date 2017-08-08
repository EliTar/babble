var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');

var messages = [];
var waitingClients = [];

var server = http.createServer(function(request, response) {
    console.log('Handling request URL: %s', request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');

    var url = urlUtil.parse(request.url, true);
    // console.log(url);
    console.log("Request is: " + url.pathname);

    if (url.pathname === '/messages') {
        if (request.method === 'GET') {
            var counter = Number(url.query.counter);
            console.log("Counter is " + counter);
            if (messages.length > counter) {
                response.end(JSON.stringify(messages.slice(counter, messages.length)));
            } else {
                waitingClients.push({ request: request, response: response, counter: counter });
            }
        }
        if (request.method === 'POST') {
            var requestBody = '';
            request.on('data', function(chunk) {
                requestBody += chunk.toString();
            });
            request.on('end', function() {
                // var data = queryUtil.parse(requestBody);
                var data = JSON.parse(requestBody);
                // console.log(data);
                // console.log(data.name);
                messages.push(data);
                // console.log(waitingClients.length);
                waitingClients.forEach(function(client) {
                    // console.log(messages.slice(client.counter, messages.length));
                    client.response.end(JSON.stringify(messages.slice(client.counter, messages.length)));
                });
                // console.log('we have all the data ', data);
                response.end();
            });
        }
    }
});

server.listen(9097);
console.log('listening...');