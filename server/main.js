var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');
var messages = require('./messages-util.js');

var waitingClients = [];
var statsWaitList = [];

function updateStats(isDeleted) {
    var tempLength = statsWaitList.length;
    if (isDeleted === true) {
        tempLength--;
    }

    while (statsWaitList.length > 0) {
        var client = statsWaitList.pop();
        var stats = {
            "users": Math.max(waitingClients.length, tempLength),
            "messages": messages.messagesArray.length - messages.getNumberOfDeletedMessages()
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
            if (messages.messagesArray.length > counter) {
                if (counter == 0)
                    updateStats(false);
                response.end(JSON.stringify(messages.getMessages(counter)));
            } else {
                waitingClients.push({ request: request, response: response, counter: counter });
                // statsWaitList.length > waitingClients.length || 
                if (messages.messagesArray.length == 0)
                    updateStats(false);
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
                currentMessageID = messages.addMessage(data);

                waitingClients.forEach(function(client) {
                    // console.log(messages.slice(client.counter, messages.length));
                    client.response.end(JSON.stringify(messages.getMessages(client.counter)));
                });
                updateStats(false);
                waitingClients.length = 0;
                // console.log('we have all the data ', data);

                currentMessageID = { id: currentMessageID };

                response.end(JSON.stringify(currentMessageID));
            });
        }
        if (request.method === 'DELETE') {
            var id = Number(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
            console.log("ID to delete is " + id);

            messages.deleteMessage(id);

            updateStats(false);

            response.end(JSON.stringify(true));
        }
        // Worked accordig to this tutorial https://www.html5rocks.com/en/tutorials/cors/
        if (request.method === 'OPTIONS') {
            response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
            // response.setHeader('Access-Control-Allow-Headers', 'X-Custom-Header');
            response.setHeader('Access-Control-Allow-Headers', 'X-Request-ID');

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

    if (url.pathname.startsWith('/logout')) {
        if (request.method === 'POST') {
            var requestBody = '';
            request.on('data', function(chunk) {
                requestBody += chunk.toString();
            });
            request.on('end', function() {

                var userUUID = JSON.parse(requestBody);
                // console.log(data);
                // console.log(data.name);
                userToLogout = waitingClients.filter(function(user) { return user.request.headers['x-request-id'] === userUUID; });
                indexOfUserToLogout = waitingClients.indexOf(userToLogout[0]);

                waitingClients.splice(indexOfUserToLogout, 1);

                // userToNotWait = statsWaitList.filter(function(user) { return user.request.headers['x-request-id'] === userUUID; });
                // indexOfUserToNotWait = statsWaitList.indexOf(userToNotWait[0]);

                // statsWaitList.splice(indexOfUserToNotWait, 1);

                updateStats(true);
            });
        }
    }
});

server.listen(9000);
console.log('listening...');