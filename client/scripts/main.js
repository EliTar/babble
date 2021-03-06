//
// Written by Eli Tarnarutsky
//

window.Babble = (function() {
    var counter = 0;
    var currentUUID = 0;
    var matchIdAndTimestamp = [];
    var url = 'http://localhost:9000';

    maintainLocalStorage();
    showDialogAndListen();
    messageToLocalstorageListener();
    userLogoutListener();
    sendMessageListener();
    textareaAutoGrow();
    resizeListener();

    // Logic is as follows:

    // If any of the following functions requires an element from the DOM,
    // we first check if is exists before proceeding.

    // maintainLocalStorage():
    // Check for a previous localstorage session.
    // Keep if exists, reset if not.

    // showDialogAndListen():
    // The communication between the server and the client is implemented with long polling.
    // When the page is opened, a modal dialog is shown to the user.
    // The browser listens for the submission of the form,
    // than saves the details of the user (name & email, if not anonymous) in the local storage (register function)
    // and opens 2 pool requests to the server: stats (getStats) and messages (getMessages).

    // messageToLocalstorageListener():
    // Each time the client's message changes, it's updated in the local storage of the browser.

    // userLogoutListener():
    // Make sure the browser will send the server an appropriate message when 
    // the user closes the tab of the chat.
    // Important for maintaining stats

    // sendMessageListener():
    // Waiting for the user to click the send button or hit enter,
    // invokes the sending of a message to the server (postMessage);

    // textareaAutoGrow():
    // In charge of, well, auto-growing the textarea.
    // Because the implementation of the design is with %, makes it a bit 
    // harder to solve - therefore I wrote this function. 

    // resizeListener():
    // To complete the textarea autogrow, the browser will listen for window resize events,
    // invoking a textarea event to update the size.

    // All the logic connected to inserting the messages to the DOM
    // follows the functions mentioned above.

    function maintainLocalStorage() {
        var lastSession = localStorage.getItem('babble');

        var userInfo = { name: '', email: '' };
        var currentMessage = '';

        if (lastSession) {
            lastSession = JSON.parse(lastSession);
            userInfo.name = lastSession.userInfo.name;
            userInfo.email = lastSession.userInfo.email;
        }

        babble = { "currentMessage": currentMessage, "userInfo": userInfo };
        localStorage.setItem('babble', JSON.stringify(babble));
    }


    function showDialogAndListen() {
        var dialog = document.querySelector('dialog');
        var modalForm = document.querySelector('dialog > form');

        if (dialog === null || modalForm === null) {
            return false;
        }

        dialogPolyfill.registerDialog(dialog);
        dialog.showModal();
        dialog.addEventListener('close', function(event) {
            if (dialog.returnValue == 'save') {
                var userInformation = new userInfo(modalForm.name.value, modalForm.email.value);
                register(userInformation);
            } else if (dialog.returnValue == 'exists') {
                var localUserInfo = JSON.parse(localStorage.getItem('babble')).userInfo;
                var userInformation = new userInfo(localUserInfo.name, localUserInfo.email);
                register(userInformation);
            } else {
                var userInformation = new userInfo('Anonymous', 'Anonymous');
                register(userInformation);
            }
            getStats(updateStats);
            getMessages(counter, proccessMessages);
        });

        var localInfo = JSON.parse(localStorage.getItem('babble'));
        if (localInfo.userInfo.email != '' && localInfo.userInfo.email != 'Anonymous') {
            dialog.returnValue = 'exists';
            dialog.close();
        }
    }

    function userInfo(name, email) {
        this.name = name;
        this.email = email;
    }

    function message(name, email, message, timestamp) {
        this.name = name;
        this.email = email;
        this.message = message;
        this.timestamp = timestamp;
    }

    function register(userInfo) {
        var babble = { "currentMessage": "", "userInfo": userInfo };
        localStorage.setItem('babble', JSON.stringify(babble));
    }

    function getStats(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/stats');
        xhr.addEventListener('load', function(e) {
            var responseText = e.target.responseText;
            if (responseText != "") // Dealing with timeout
                callback(JSON.parse(responseText));
            else
                getStats(updateStats);
        });
        xhr.send();
    }

    function getMessages(counter, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/messages?counter=' + counter);
        currentUUID = generateUUID();
        xhr.setRequestHeader('X-Request-ID', currentUUID);
        xhr.addEventListener('load', function(e) {
            var responseText = e.target.responseText;
            if (responseText != "") // Dealing with timeout
                callback(JSON.parse(responseText), counter);
            else
                getMessages(counter, proccessMessages);
        });
        xhr.send();
    }

    // Took from this cool guy https://gist.github.com/jed/982883
    function generateUUID(a) {
        return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, generateUUID);
    }

    function proccessMessages(messages, counter) {
        messages.forEach(function(message) {
            if (message != "")
                addMessageToChat(message);
        });

        counter += messages.length;
        getMessages(counter, proccessMessages);
    }

    function messageToLocalstorageListener() {
        // Update the local storage to current message
        var userText = document.querySelector('textarea');

        if (userText === null) {
            return false;
        }

        userText.addEventListener("input", function(evt) {
            var localState = JSON.parse(localStorage.babble);
            localState.currentMessage = userText.value;
            localStorage.setItem('babble', JSON.stringify(localState));
        }, false);
    }

    function userLogoutListener() {
        window.addEventListener('unload', function() {
            navigator.sendBeacon(url + '/logout', JSON.stringify(currentUUID));
        });
    }

    function sendMessageListener() {
        var form = document.querySelector('section > form');
        var textarea = document.querySelector('textarea');

        if (form === null || textarea === null) {
            return false;
        }

        textarea.addEventListener('keydown', function(e) {
            if (e.keyCode == 13 && !e.shiftKey) // Enter for sending, Shift + Enter for new line
                formSubmit(e, textarea);
        });

        form.addEventListener('submit', function(e) {
            formSubmit(e, textarea);
        });
    }

    function formSubmit(e, textarea) {
        e.preventDefault();

        if (textarea.value == "") {
            alert("You can't send an empty message");
            return;
        }

        var parseLocalDate = JSON.parse(localStorage.babble);
        var userMessage = {
            "name": parseLocalDate.userInfo.name,
            "email": parseLocalDate.userInfo.email,
            "message": parseLocalDate.currentMessage,
            "timestamp": Date.now()
        };

        postMessage(userMessage, trackUserMessages);
        textarea.value = "";

        // Handle autogrow
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });

        textarea.dispatchEvent(event);
    }

    function postMessage(message, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url + '/messages');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), message.timestamp);
        });
        xhr.send(JSON.stringify(message));
    }

    // This way we can connect between IDs and timestamps for deleting messages.
    // IDs are returned from the server, in contrast to timestamps
    // which are known at the time of submission -
    // and we don't have to wait for the ID to create the message.

    function trackUserMessages(serverResponse, timestamp) {
        var messageIdAndTimestemp = { "id": serverResponse.id, "timestamp": timestamp };
        matchIdAndTimestamp.push(messageIdAndTimestemp);
    }

    function invokeDeleteMessage(element) {
        var messageToDelete = element.closest('li');
        timestampOfIdToDelete = messageToDelete.getAttribute('id');
        matching = matchIdAndTimestamp.filter(function(message) { return message.timestamp == timestampOfIdToDelete; });
        if (matching.length != 0) {
            idToDelete = matching[0].id;
            deleteMessage(idToDelete, deleteMessageByID);
        } else {
            alert("You can only delete your messages from the current session");
        }
    }

    function deleteMessage(id, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('DELETE', url + '/messages/' + id, true);
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), id);
        });
        xhr.send();
    }

    function resizeListener() {
        var textarea = document.querySelector('textarea');

        if (textarea === null) {
            return false;
        }

        window.addEventListener("resize", function(evt) {
            // Handle autogrow
            var event = new Event('input', {
                'bubbles': true,
                'cancelable': true
            });

            textarea.dispatchEvent(event);
        }, false);
    }

    // We want to know what should be the size of the textarea in %,
    // to accommodate the text inside (and smaller than 300px).

    // When the textarea is at its original size, we can access the
    // textarea.scrollHeight attribute, and check the size needed
    // for the textarea to be without a scrollbar.

    // We revert the text area to its original size,
    // check the attribute, and then calculate the according % needed
    // for manipulating the design.

    // Yes, this may not be the prettiest way of doing so,
    // but it's that best one I figured out after thinking and testing a bunch of
    // solutions for precent based design.

    function textareaAutoGrow() {
        var textarea = document.querySelector('textarea');
        var mainPane = document.querySelector('main');
        var inputArea = document.querySelector('.UserInputArea');
        var messages = document.querySelector('.Messages');

        if (textarea && mainPane && inputArea && messages) {
            var originalPercent = pixelToPercentHeight(textarea.scrollHeight, mainPane);
            textarea.addEventListener('input', function(evt) {
                oldScroll = textarea.scrollTop;
                inputArea.style.cssText = 'height:' + originalPercent + '%';
                var percent = pixelToPercentHeight(textarea.scrollHeight, mainPane);
                if (percent < 17)
                    percent = 17;
                inputArea.style.cssText = 'height:' + percent + '%';
                var bottom = (Number(percent));
                var maxHeight = 100 - Number(percent) - 10;
                messages.style.cssText = 'bottom: ' + bottom + '%; max-height: ' + maxHeight + '%';
                if (textarea.scrollHeight > 300) {
                    percent = pixelToPercentHeight(300, mainPane);
                    inputArea.style.cssText = 'height:' + percent + '%';
                    textarea.style.cssText = 'overflow-y: auto';
                    textarea.scrollTop = oldScroll;
                    bottom = (Number(percent));
                    maxHeight = 100 - Number(percent) - 10;
                    messages.style.cssText = 'bottom:' + bottom + '%; max-height: ' + maxHeight + '%';
                }
            }, false);
        }
    }

    function pixelToPercentHeight(pixel, mainPane) {
        var screenHeight = mainPane.clientHeight;
        var Percent = Math.round((pixel / screenHeight) * 100);
        return Percent;
    }

    // All the logic related to dealing with the client's HTML content.
    // Summery:
    // - Updating the user stats
    // - Deleting a message
    // - Class names for the created messages
    // - Logic of adding a message: addMessageToChat(message) and all that follows.

    function updateStats(stats) {
        var mesCounterObject = document.querySelector('dd:first-of-type');
        var userCounterObject = document.querySelector('dd:last-of-type');

        mesCounterObject.innerText = stats.messages;
        userCounterObject.innerText = stats.users;

        getStats(updateStats);
    }

    function deleteMessageByID(confirmation, id) {
        if (confirmation === true) {
            matching = matchIdAndTimestamp.filter(function(message) { return message.id === id; });
            timestampToDelete = matching[0].timestamp;
            toDelete = document.getElementById(timestampToDelete);
            toDelete.remove();
        }
    }

    const classNames = {
        messages: 'Messages',
        messageImg: 'Message-image',
        messageText: 'Message-text',
        messageBox: 'Message-box',
        messageX: 'Message-close',
        messageName: 'Message-name',
        messageTime: 'Message-time',
        inputArea: 'UserInputArea'
    };

    function addMessageToChat(message) {
        var messages = document.querySelector('.' + classNames.messages);

        var holeMessage = document.createElement("li");
        holeMessage.setAttribute('id', message.timestamp);

        profileURL = 'https://www.gravatar.com/avatar/' + message.emailHash + '.jpg?d=identicon';

        if (message.name == "Anonymous")
            profileURL = 'images/anon.png';

        profileImage = createMessageProfilePic(encodeURI(profileURL));
        messageBox = createMessageBox(message.message, message.name, message.timestamp, message.email);

        holeMessage.appendChild(profileImage);
        holeMessage.appendChild(messageBox);

        messages.appendChild(holeMessage);
        messages.scrollTop = messages.scrollHeight;
    }

    function createMessageProfilePic(imgPath) {
        var profileImage = new Image();
        profileImage.src = imgPath;
        profileImage.className = classNames.messageImg;
        profileImage.alt = '';

        return profileImage;
    }

    function createMessageBox(userText, userName, userMessageTime, userEmail) {
        var messageBox = document.createElement('section');
        messageBox.setAttribute('class', classNames.messageBox);
        messageBox.setAttribute('tabindex', 1);

        if (userEmail === JSON.parse(localStorage.babble).userInfo.email) {
            var button = createExitButton();
            messageBox.appendChild(button);
        }

        var name = createMessageName(userName);
        var time = createMessageTime(userMessageTime);
        var paragraph = createMessageContent(userText);

        messageBox.appendChild(name);
        messageBox.appendChild(time);
        messageBox.appendChild(paragraph);

        return messageBox;
    }

    function createExitButton() {
        var button = document.createElement('button');
        var buttonText = document.createTextNode('x');
        button.setAttribute('class', classNames.messageX);
        button.setAttribute('aria-label', "Delete Message");
        button.setAttribute('tabindex', 1);
        button.setAttribute('onclick', 'Babble.invokeDeleteMessage(this)');
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
        var timeText = document.createTextNode(parseTime(currentTime));
        time.setAttribute('datetime', new Date(currentTime).toISOString());
        time.setAttribute('class', classNames.messageTime);
        time.appendChild(timeText);

        return time;
    }

    function parseTime(time) {
        var userTime = new Date(time);
        var h = makeTimePretty(userTime.getHours());
        var m = makeTimePretty(userTime.getMinutes());

        return h + ':' + m;
    }

    function makeTimePretty(time) {
        if (time >= 0 && time <= 9) {
            time = '0' + time;
        }
        return time;
    }

    function createMessageContent(userContent) {
        var paragraph = document.createElement('p');
        var userText = document.createTextNode(userContent);
        paragraph.setAttribute('class', classNames.messageText);
        paragraph.appendChild(userText);

        return paragraph;
    }

    return {
        register: register,
        getMessages: getMessages,
        postMessage: postMessage,
        deleteMessage: deleteMessage,
        getStats: getStats,
        invokeDeleteMessage: invokeDeleteMessage
    };
})();