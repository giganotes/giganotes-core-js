
const addon = require('../native/index.node');
const messages = require('./messages_pb');
const { EventEmitter } = require('events');

// The `MyEventEmitter` class provides glue code to abstract the `poll`
// interface provided by the Neon class. It may be constructed and used
// as a normal `EventEmitter`, including use by multiple subscribers.
class MyEventEmitter extends EventEmitter {
  constructor() {
    super();

    // Create an instance of the Neon class
    const channel = new addon.RustChannel();

    // Marks the emitter as shutdown to stop iteration of the `poll` loop
    this.isShutdown = false;

    // The `loop` method is called continuously to receive data from the Rust
    // work thread.
    const loop = () => {
      // Stop the receiving loop and shutdown the work thead. However, since
      // the `poll` method uses a blocking `recv`, this code will not execute
      // until either the next event is sent on the channel or a receive
      // timeout has occurred.
      if (this.isShutdown) {
        channel.shutdown();
        return;
      }

      // Poll for data      
      channel.poll((err, e) => {        
        if (err) this.emit('error', err);
        else if (e) {
          const { event, ...data } = e;

          // Emit the event
          this.emit(event, data);
        }
        // Otherwise, timeout on poll, no data to emit

        // Schedule the next iteration of the loop. This is performed with
        // a `setImmediate` to yield to the event loop, to let JS code run
        // and avoid a stack overflow.
        setImmediate(loop);
      });
    };

    // Start the polling loop on next iteration of the JS event loop to prevent zalgo.
    setImmediate(loop);
  }

  // Mark the channel for shutdown
  shutdown() {
    this.isShutdown = true;
    return this;
  }
}

var initLogging = function() {
  addon.initLogging();
}

var initDataSerialized = function(apiPath, dataPath) {
  var initCommand = new messages.InitData();
  initCommand.setApipath(apiPath);
  initCommand.setDatapath(dataPath);
  var bytes = initCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 1);  
}

var initData = function(apiPath, dataPath) {  
  return messages.EmptyResultResponse.deserializeBinary(initDataSerialized(apiPath, dataPath));    
}

var createNoteSerialized = function(title, text, folderId) {
  var createNoteCommand = new messages.CreateNote();
  createNoteCommand.setTitle(title);
  createNoteCommand.setText(text);    
  createNoteCommand.setFolderid(folderId);    
  var bytes = createNoteCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 2);  
};

var createNote = function(title, text, folderId) {
    return messages.CreateNoteResponse.deserializeBinary(createNoteSerialized(title, text, folderId));    
};

var getNotesByFolderSerialized = function(folderId) {
  var getNodesListCommand = new messages.GetNotesList();    
  getNodesListCommand.setFolderid(folderId);
  var bytes = getNodesListCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 3);  
}

var getNotesByFolder = function(folderId) {
  return messages.GetNotesListResponse.deserializeBinary(getNotesByFolderSerialized(folderId));  
}

var getNoteByIdSerialized = function(noteId) {
  var getNoteCommand = new messages.GetNoteById();    
  getNoteCommand.setNoteid(noteId);
  var bytes = getNoteCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 5);  
}

var getNoteById = function(noteId) {
  return messages.GetNoteByIdResponse.deserializeBinary(getNoteByIdSerialized(noteId));  
}

var getFolderByIdSerialized = function(folderId) {
  var getFolderCommand = new messages.GetFolderById();    
  getFolderCommand.setFolderid(folderId);
  var bytes = getFolderCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 6);
}

var getFolderById = function(folderId) {
  return messages.GetFolderByIdResponse.deserializeBinary(getFolderByIdSerialized(folderId));  
}

var makeLoginSerialized = function(email, password) {
  var createNoteCommand = new messages.Login();  
  createNoteCommand.setEmail(email);
  createNoteCommand.setPassword(password);
  var bytes = createNoteCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 8);  
}

var makeLogin = function(email, password) {
  return messages.LoginResponse.deserializeBinary(makeLoginSerialized(email, password));    
}

var register = function(email, password) {
  return messages.LoginResponse.deserializeBinary(registerSerialized(email, password));    
}

var registerSerialized = function(email, password) {
  var registerCommand = new messages.Login();  
  registerCommand.setEmail(email);
  registerCommand.setPassword(password);
  var bytes = registerCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 19);  
}

var getLastLoginDataSerialized = function() {
  return addon.handleCommand(new Uint8Array([]).buffer, 9);  
}

var getRootFolderSerialized = function() {
  return addon.handleCommand(new Uint8Array([]).buffer, 10);
}

var getAllFoldersSerialized = function() {
  return addon.handleCommand(new Uint8Array([]).buffer, 11);  
}

var getAllNotesSerialized = function(offset, limit) {
  var getAllNotesCommand = new messages.GetAllNotes();  
  getAllNotesCommand.setOffset(offset);
  getAllNotesCommand.setLimit(limit);
  var bytes = getAllNotesCommand.serializeBinary();  
  return addon.handleCommand(bytes.buffer, 12);  
}

var getLastLoginData = function() {  
  return messages.GetLastLoginDataResponse.deserializeBinary(getLastLoginDataSerialized());    
}

var getRootFolder = function() {  
  return messages.GetRootFolderResponse.deserializeBinary(getRootFolderSerialized());
}

var getAllFolders = function() {
  return messages.GetFoldersListResponse.deserializeBinary(getAllFoldersSerialized());  
}

var getAllNotes = function(offset, limit) {  
  return messages.GetNotesListResponse.deserializeBinary(getAllNotesSerialized(offset, limit));  
}

var createFolderSerialized = function(title, parentId) {
  var createFolderCommand = new messages.CreateFolder();
  createFolderCommand.setTitle(title);
  createFolderCommand.setParentid(parentId);
  var bytes = createFolderCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 13);  
};

var createFolder = function(title, parentId) {
  return messages.CreateFolderResponse.deserializeBinary(createFolderSerialized(title, parentId));    
};

var updateNoteSerialized = function(id, folderId, title, text) {  
  var updateCommand = new messages.UpdateNote();  
  updateCommand.setId(id);
  updateCommand.setFolderid(folderId);
  updateCommand.setTitle(title);
  updateCommand.setText(text);
  var bytes = updateCommand.serializeBinary();  
  return addon.handleCommand(bytes.buffer, 14);  
};

var updateNote = function(id, folderId, title, text) {
  return messages.EmptyResultResponse.deserializeBinary(updateNoteSerialized(id, folderId, title, text));    
};


var updateFolderSerialized = function(id, parentId, title, level) {
  var updateCommand = new messages.UpdateFolder();  
  updateCommand.setId(id);
  updateCommand.setParentid(parentId);
  updateCommand.setTitle(title);
  updateCommand.setLevel(level);
  var bytes = updateCommand.serializeBinary();  
  return addon.handleCommand(bytes.buffer, 15);  
};

var updateFolder = function(id, parentId, title, level) {
  return messages.EmptyResultResponse.deserializeBinary(updateFolderSerialized(id, parentId, title, level));    
}

var syncronize = function() {  
  addon.handleAsyncCommand(new Uint8Array([]).buffer, 7);  
}

var removeNoteSerialized = function(id) {  
  var command = new messages.RemoveNote();  
  command.setNoteid(id);
  var bytes = command.serializeBinary();  
  return addon.handleCommand(bytes.buffer, 16);  
};

var removeNote = function(id) {
  return messages.EmptyResultResponse.deserializeBinary(removeNoteSerialized(id));    
};

var removeFolderSerialized = function(id) {  
  var command = new messages.RemoveNote();  
  command.setFolderid(id);
  var bytes = command.serializeBinary();  
  return addon.handleCommand(bytes.buffer, 17);  
};

var removeFolder = function(id) {
  return messages.EmptyResultResponse.deserializeBinary(removeFolderSerialized(id));    
};

var searchNotesSerialized = function(query, folderId) {
  var searchNotesCommand = new messages.SearchNotes();    
  searchNotesCommand.setQuery(query);
  searchNotesCommand.setFolderid(folderId)
  var bytes = searchNotesCommand.serializeBinary();
  return addon.handleCommand(bytes.buffer, 18);  
}

var searchNotes = function(query) {
  return messages.GetNotesListResponse.deserializeBinary(searchNotesSerialized(query));  
}

module.exports.removeNoteSerialized = removeNoteSerialized;
module.exports.removeFolderSerialized = removeFolderSerialized;
module.exports.updateNoteSerialized = updateNoteSerialized;
module.exports.updateFolderSerialized = updateFolderSerialized;
module.exports.getNoteByIdSerialized = getNoteByIdSerialized;
module.exports.getFolderByIdSerialized = getFolderByIdSerialized;
module.exports.createNoteSerialized = createNoteSerialized;
module.exports.createFolderSerialized = createFolderSerialized;
module.exports.getNotesByFolderSerialized = getNotesByFolderSerialized;
module.exports.getAllNotesSerialized = getAllNotesSerialized;
module.exports.getAllFoldersSerialized = getAllFoldersSerialized;
module.exports.getRootFolderSerialized = getRootFolderSerialized;
module.exports.getLastLoginDataSerialized = getLastLoginDataSerialized;
module.exports.makeLoginSerialized = makeLoginSerialized;
module.exports.registerSerialized = registerSerialized;
module.exports.initDataSerialized = initDataSerialized;
module.exports.createNoteSerialized = createNoteSerialized;
module.exports.searchNotesSerialized = searchNotesSerialized;

module.exports.synchronize = syncronize;
module.exports.getNoteById = getNoteById;
module.exports.getFolderById = getFolderById;
module.exports.createNote = createNote;
module.exports.createFolder = createFolder;
module.exports.updateNote = updateNote;
module.exports.updateFolder = updateFolder;
module.exports.removeNote = removeNote;
module.exports.removeFolder = removeFolder;
module.exports.getNotesByFolder = getNotesByFolder;
module.exports.getAllNotes = getAllNotes;
module.exports.getAllFolders = getAllFolders;
module.exports.getRootFolder = getRootFolder;
module.exports.getLastLoginData = getLastLoginData;
module.exports.makeLogin = makeLogin;
module.exports.register = register;
module.exports.initLogging = initLogging;
module.exports.initData = initData;
module.exports.createNote = createNote;
module.exports.searchNotes = searchNotes;
module.exports.MyEventEmitter = MyEventEmitter;
