var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');

var messages = [];
var waitingClients = [];
var statsWaitList = [];
var messagesID = 0;

function updateStats() {
    // console.log("Number of messages is " + messagesID);
    // console.log("Number of users is " + onlineClients);
    // statsWaitList.forEach(function(client) {
    //     var stats = {
    //         "users": waitingClients.length,
    //         "messages": messagesID
    //     };
    //     client.response.end(JSON.stringify(stats));
    // });

    var tempLength = statsWaitList.length;

    while (statsWaitList.length > 0) {
        var client = statsWaitList.pop();
        var stats = {
            "users": Math.max(waitingClients.length, tempLength),
            "messages": messagesID
        };
        client.response.end(JSON.stringify(stats));
    }

    // statsWaitList.length = 0;
}

var server = http.createServer(function(request, response) {
    console.log('Handling request URL: %s', request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');

    var url = urlUtil.parse(request.url, true);
    // console.log(url);
    console.log("Request is: " + url.pathname);

    if (url.pathname.startsWith('/messages')) {
        if (request.method === 'GET') {
            var counter = Number(url.query.counter);
            console.log("Counter is " + counter);
            if (messages.length > counter) {
                if (counter == 0)
                    updateStats();
                response.end(JSON.stringify(messages.slice(counter, messages.length)));
            } else {
                waitingClients.push({ request: request, response: response, counter: counter });
                // statsWaitList.length > waitingClients.length || 
                if (messages.length == 0)
                    updateStats();
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
                var receivedMessage = data;
                receivedMessage.id = messagesID;
                messages.push(receivedMessage);
                messagesID++;
                // console.log(waitingClients.length);
                waitingClients.forEach(function(client) {
                    // console.log(messages.slice(client.counter, messages.length));
                    client.response.end(JSON.stringify(messages.slice(client.counter, messages.length)));
                });
                updateStats();
                waitingClients.length = 0;
                // console.log('we have all the data ', data);

                var userMessageID = { "id": receivedMessage.id };
                response.end(JSON.stringify(userMessageID));
            });
        }
        if (request.method === 'DELETE') {
            var id = Number(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
            console.log("ID to delete is " + id);
            messageToDelete = messages.filter(function(message) { return message.id === id; });
            indexOfMessageToDelete = messages.indexOf(messageToDelete[0]);

            messages.splice(indexOfMessageToDelete, 1);

            response.end(JSON.stringify(true));
        }
        // Worked accordig to this tutorial https://www.html5rocks.com/en/tutorials/cors/
        if (request.method === 'OPTIONS') {
            response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
            response.setHeader('Access-Control-Allow-Headers', 'X-Custom-Header');
            // response.writeHead(204);
            // response.write(http.STATUS_CODES[204] + '\n');
            response.end(JSON.stringify(204));
        }
    }

    if (url.pathname.startsWith('/stats')) {
        if (request.method === 'GET') {
            statsWaitList.push({ request: request, response: response });
        }
    }

});

server.listen(9097);
console.log('listening...');