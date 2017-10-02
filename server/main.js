var http = require('http');
var urlUtil = require('url');
var queryUtil = require('querystring');
var messages = require('./messages-util.js');

var waitingClients = [];
var statsWaitList = [];

var server = http.createServer(function(request, response) {
    console.log('Handling request URL: %s', request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');

    var url = urlUtil.parse(request.url, true);
    console.log("Request is: " + url.pathname);

    if (url.pathname.startsWith('/messages')) {
        switch (request.method) {
            case 'GET':
                handleMessagesGet(url, request, response);
                break;
            case 'POST':
                handlePostRequest(request, response, handleMessagesPost);
                break;
            case 'DELETE':
                handleMessagesDelete(url, response);
                break;
            case 'OPTIONS':
                handleMessagesOptions(response);
                break;
            default:
                endResponseWithCode(response, 405); // Bad HTTP Method
                break;
        }
    } else if (url.pathname.startsWith('/stats')) {
        if (request.method === 'GET')
            handleStatsGet(request, response);
        else
            endResponseWithCode(response, 405); // Bad HTTP Method
    } else if (url.pathname.startsWith('/logout')) {
        if (request.method === 'POST')
            handlePostRequest(request, response, handleLogoutPost);
        else
            endResponseWithCode(response, 405); // Bad HTTP Method
    } else {
        if (request.method === 'OPTIONS')
            endResponseWithCode(response, 204);
        else
            endResponseWithCode(response, 404); // non-existent URL
    }
});

preventRequestTimeout();

server.listen(9000);
console.log('listening...');

// Every 2 minutes, return empty response to clients
function preventRequestTimeout() {
    setInterval(function() {
        var expire = Date.now() - 80 * 1000;

        for (i = 0; i < waitingClients.length; i++) {
            if (waitingClients[i].timestamp < expire) {
                endResponseWithCode(waitingClients[i].response, 200);
                waitingClients.splice(i, 1);
            }
        }

        for (i = 0; i < statsWaitList.length; i++) {
            if (statsWaitList[i].timestamp < expire) {
                endResponseWithCode(statsWaitList[i].response, 200);
                statsWaitList.splice(i, 1);
            }
        }

    }, 10 * 1000);
}

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
}

function handlePostRequest(request, response, callback) {
    var requestBody = '';
    request.on('data', function(chunk) {
        requestBody += chunk.toString();
    });
    request.on('end', function() {
        var data = JSON.parse(requestBody);
        callback(data, response);
    });
}

function handleMessagesPost(data, response) {
    currentMessageID = messages.addMessage(data);

    waitingClients.forEach(function(client) {
        client.response.end(JSON.stringify(messages.getMessages(client.counter)));
    });
    updateStats(false);
    waitingClients.length = 0;

    currentMessageID = { id: currentMessageID };

    response.end(JSON.stringify(currentMessageID));
}

function handleMessagesGet(url, request, response) {
    var counter = Number(url.query.counter);
    console.log("Counter is " + counter);
    if (messages.messagesArray.length > counter) {
        if (counter == 0)
            updateStats(false);
        response.end(JSON.stringify(messages.getMessages(counter)));
    } else {
        waitingClients.push({ request: request, response: response, counter: counter, timestamp: new Date().getTime() });
        // statsWaitList.length > waitingClients.length || 
        if (messages.messagesArray.length == 0)
            updateStats(false);
    }
}

function handleMessagesDelete(url, response) {
    var id = Number(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
    console.log("ID to delete is " + id);

    messages.deleteMessage(id);

    updateStats(false);

    response.end(JSON.stringify(true));
}

function handleMessagesOptions(response) {
    // Worked accordig to this tutorial https://www.html5rocks.com/en/tutorials/cors/
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    response.setHeader('Access-Control-Allow-Headers', 'X-Request-ID');
    endResponseWithCode(response, 204);
}

function handleStatsGet(request, response) {
    statsWaitList.push({ request: request, response: response, timestamp: new Date().getTime() });
}

function handleLogoutPost(data, response) {
    var userUUID = data;

    userToLogout = waitingClients.filter(function(user) { return user.request.headers['x-request-id'] === userUUID; });
    indexOfUserToLogout = waitingClients.indexOf(userToLogout[0]);

    waitingClients.splice(indexOfUserToLogout, 1);

    // userToNotWait = statsWaitList.filter(function(user) { return user.request.headers['x-request-id'] === userUUID; });
    // indexOfUserToNotWait = statsWaitList.indexOf(userToNotWait[0]);

    // statsWaitList.splice(indexOfUserToNotWait, 1);

    updateStats(true);
}

function endResponseWithCode(response, code) {
    response.statusCode = code;
    response.statusMessage = http.STATUS_CODES[code];
    response.end();
}