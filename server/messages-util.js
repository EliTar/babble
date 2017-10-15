// Code is good enough without documentation :)

var crypto = require('crypto');

var messagesArray = [];
var messagesID = 0;
var numberOfDeletedMessages = 0;

function getNumberOfDeletedMessages() {
    return numberOfDeletedMessages;
}

function getMessages(counter) {
    var start = counter - numberOfDeletedMessages;
    start = start >= 0 ? start : 0;

    return messagesArray.slice(counter, messagesArray.length);
}

function addMessage(message) {
    message.id = messagesID;
    message.emailHash = crypto.createHash('md5').update(String(message.email)).digest("hex");
    messagesArray.push(message);
    return messagesID++;
}

function deleteMessage(id) {
    messageToDelete = messagesArray.filter(function(message) { return message.id === id; });
    indexOfMessageToDelete = messagesArray.indexOf(messageToDelete[0]);

    messagesArray[indexOfMessageToDelete] = "";
    numberOfDeletedMessages++;
}

module.exports = {
    messagesArray: messagesArray,
    getNumberOfDeletedMessages: getNumberOfDeletedMessages,
    getMessages: getMessages,
    addMessage: addMessage,
    deleteMessage: deleteMessage
};