const classNames = {
    messages: 'messages',
    messageImg: 'message-image',
    messageText: 'message-text',
    messageBox: 'message-box',
    messageX: 'message-close',
    messageName: 'message-name',
    messageTime: 'message-time',
    inputArea: 'user-input-area'
};

function hideMessage(element) {
    var toHide = element.closest('li');
    toHide.style.display = "none";
}

function createMessageProfilePic(imgPath) {
    var profileImage = document.createElement('img');
    profileImage.setAttribute('src', imgPath);
    profileImage.setAttribute('class', classNames.messageImg);

    return profileImage;
}

function createExitButton() {
    var button = document.createElement('button');
    var buttonText = document.createTextNode('x');
    button.setAttribute('class', classNames.messageX);
    button.setAttribute('onclick', 'hideMessage(this)');
    button.appendChild(buttonText);

    return button;
}

function createMessageName(userName) {
    var name = document.createElement('cite');
    var nameText = document.createTextNode(userName);
    name.setAttribute('class', classNames.messageName);
    name.appendChild(nameText);

    return name;
}

function createMessageTime(currentTime) {
    var time = document.createElement('time');
    var timeText = document.createTextNode(currentTime);
    time.setAttribute('datetime', '08:00+03:00');
    time.setAttribute('class', classNames.messageTime);
    time.appendChild(timeText);

    return time;
}

function createMessageContent(userContent) {
    var paragraph = document.createElement('p');
    var userText = document.createTextNode(userContent);
    paragraph.setAttribute('class', classNames.messageText);
    paragraph.appendChild(userText);

    return paragraph;
}

function createMessageBox(userText, userName, userMessageTime) {
    var messageBox = document.createElement('article');
    messageBox.setAttribute('class', classNames.messageBox);

    var button = createExitButton();
    var name = createMessageName(userName);
    var time = createMessageTime(userMessageTime);
    var paragraph = createMessageContent(userText);

    messageBox.appendChild(button);
    messageBox.appendChild(name);
    messageBox.appendChild(time);
    messageBox.appendChild(paragraph);

    return messageBox;
}

function returnCurrentTime() {
    var currentTime = new Date();
    var h = makeTimePretty(currentTime.getHours());
    var m = makeTimePretty(currentTime.getMinutes());

    return h + ':' + m;
}

function makeTimePretty(time) {
    if (time >= 0 && time <= 9) {
        time = '0' + time;
    }
    return time;
}

function addMessageToChat() {
    var holeMessage = document.createElement("li");
    var userInput = document.querySelector('.' + classNames.inputArea + ' textarea').value;

    profileImage = createMessageProfilePic('profilePic.jpg');
    messageBox = createMessageBox(userInput, 'Dolev Nishlis', returnCurrentTime());

    holeMessage.appendChild(profileImage);
    holeMessage.appendChild(messageBox);

    var messages = document.querySelector('.' + classNames.messages)
    messages.appendChild(holeMessage);

    messages.scrollTop = messages.scrollHeight;
}