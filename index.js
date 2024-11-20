const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');

//DB setup
const mdbClient = new MongoClient(process.env.MONGO_URI);
const dbName = 'fcc-backend';

let userCollection, entryCollection;

const connectMongoDatabase = async () => {
  await mdbClient.connect();
  console.log('Connected successfully to server');
  const db = mdbClient.db(dbName);
  userCollection = db.collection('users');
  entryCollection = db.collection('entries');

  return;
}

class User {
  constructor(username){
    this.username = username;
  }
}

class Entry {
  constructor(refId, description, duration, date){
    this.refId = refId;
    this.description = description;
    this.duration = duration;
    this.date = date;
  }
}

//models
const createUser = async (username) =>{
  try {
    const user = new User(username);
    const dbResp = await userCollection.insertOne(user);
    if(dbResp)
      user._id = dbResp.insertedId.toString();
    return user;
  } catch (error) {
    return error;
  }
};

const getUserById = async (userId) =>{
  try {
    const oId = new ObjectId(userId);
    const dbResp = await userCollection.findOne(oId);
    if(!dbResp){
      throw new Error('Unable to locate specified user');
    }
    
    return dbResp;
  } catch (error) {
    console.error(error);
    return false;
  }
};

const getAllUsers = async () =>{
  try {
    const userList = [];
    for await (const user of userCollection.find({})){
      userList.push(user);
    }
    
    if(userList.length < 1){throw new Error('No User Items Found')};
    return userList;
  } catch (error) {
    console.error(error);
    return false;
  }
};

const createLogEntry = async (entry) =>{
  try {

    const dbResp = await entryCollection.insertOne(entry);
    if(!dbResp.acknowledged){throw new Error('failed to create log entry');}

    return true;

  } catch (error) {
    console.error(error);
    return false;    
  }
};

const getLogEntries = async (userId, from, to, limit, done) => {
  try {
    let query = entryCollection.find({refId: userId});
    query = query.sort('date', 1).project({_id: 0, date: 1, description: 1, duration: 1});


    switch(true){
      //from only
      case (from && ! to) : query = query.filter({date: {$gte: from}}); break;
      //to only
      case (!from && to) : query = query.filter({date: {$lte: to}}); break;
      //from and to
      case (from && to) : query = query.filter({date: {$elemMatch: {$gte: from, $lte: to}}}); break;
    }
    
    if(limit){query = query.limit(limit);}

    query = await query.toArray();
    return query.map(log => {
      log.date = log.date.toDateString();
      return log;
    });
  } catch (error) {
    console.error(error);
    return false;
  }
};

//controllers
const handleError = (res, e, next) => {
  console.error(e);
  res.json({error: e.message});
  next();
}

const createUserController = async (req, res, next)=>{
  try {
    const username = req.body.username;
    if(username.trim() === "" || username.length < 1){
      throw new Error('Invalid User Name Provided');
    }

    const user = await createUser(username);
    if(user){
      res.json({
        username: user.username,
        _id: user._id
      });
      next();
    }
  } catch (error) {
    handleError(res, error, next);
  }
}

const getAllUsersController = async (req, res, next)=>{
  try {
    const users = await getAllUsers();
    if(!users){
      throw new Error('Failed to retrieve users list');
    }

    res.json(users);
    next();
  } catch (error) {
    handleError(res, error, next);
  }
}

const createLogEntryController = async (req, res, next)=>{
  try {
    const _id = req.params._id;
    const {description, duration, date } = req.body;

    const user = await getUserById(_id);
    if (!user){throw new Error('Failed to locate user');}

    const entry = new Entry(
      user._id.toString(), 
      description,
      Number(duration),
      date ? new Date(date) : new Date()
    );
    const newEntry = await createLogEntry(entry);
    if(!newEntry){throw new Error('Failed to create Log Entry');}
    res.json({
      username: user.username,
      description: entry.description,
      duration: entry.duration,
      date: entry.date.toDateString(),
      _id: entry.refId
    });
    next();
  } catch (error) {
    handleError(res, error, next);
  }
}

const getLogEntriesController = async (req, res, next)=>{
  try {
    const _id = req.params._id;

    const userData = await getUserById(_id);
    if(!userData){
      throw new Error('Unable to locate specified user');
    }

    const from = req.query.from === undefined ? false : new Date(req.query.from) || false;
    const to = req.query.to === undefined ? false : new Date(req.query.to) || false;
    const limit = req.query.limit === undefined ? false : Number(req.query.limit) || false;

    const logs = await getLogEntries(userData._id.toString(), from, to, limit);
    if(!logs){
      throw new Error(`Failed to retrieve log entries for ${userData.username}`);
    }

    res.json({
      username: userData.username,
      count: logs.length,
      _id: userData._id.toString(),
          log: logs
    });
    next();
  } catch (error) {
    handleError(res, error, next);
  }
}

//server setup
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

//homepage
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

//GET
app.get('/api/users', getAllUsersController);
app.get('/api/users/:_id/logs', getLogEntriesController);

//POST
app.post('/api/users', createUserController);
app.post('/api/users/:_id/exercises', createLogEntryController);


connectMongoDatabase().then().catch(e => {console.error(e);})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
