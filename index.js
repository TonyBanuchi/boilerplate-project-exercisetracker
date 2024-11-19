const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

//DB setup
mongoose.connect(process.env.MONGO_URI, { });

let User, Entry;

const userSchema = new mongoose.Schema({
  username: {
    type: mongoose.SchemaTypes.String,
    required: true
  }
});

const entrySchema = new mongoose.Schema({
  refId: {type: String, required: true},
  description: {type: String, required: true},
  duration: {type: Number, required: true},
  date: {type: Date}
});

User = mongoose.model('User', userSchema);
Entry = mongoose.model('Entry', entrySchema)

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

    await createUser(username, (err, data) => {
      if(err){
        throw new Error('User creation failed', {cause: err});
      }

      res.json({
        username: data.username,
        _id: data._id
      });
      next();
    })
  } catch (error) {
    handleError(res, error, next);
  }
}

const getAllUsersController = async (req, res, next)=>{
  try {
    await getAllUsers((err, data) => {
      if(err){
        throw new Error('Failed to retrieve users list', {cause: err});
      }

      res.json(data);
      next();
    })
  } catch (error) {
    handleError(res, error, next);
  }
}

const createLogEntryController = async (req, res, next)=>{
  try {
    const _id = req.params._id;
    const {description, duration, date } = req.body;

    await getUser(_id, async (err, userData)=>{
      if(err){
        throw new Error('Could not find provided user', {cause: err});
      }

      await createLogEntry(_id, description, duration, date, (err, data) =>{
        if(err){
          throw new Error('Failed to create log entry');
        }

        res.json({
          username: userData.username,
          description: data.description,
          duration: data.duration,
          date: data.date.toDateString(),
          _id: data.refId
        });
        next();
      })
    })
  } catch (error) {
    handleError(res, error, next);
  }
}
const getLogEntriesController = async (req, res, next)=>{
  try {
    const _id = req.params._id;

    await getUser(_id, async (err, userData) => {
      if(err){
        throw new Error('Unable to locate specified user', {cause: err});
      }

      const from = req.query.from === undefined ? false : new Date(req.query.from) || false;
      const to = req.query.to === undefined ? false : new Date(req.query.to) || false;
      const limit = req.query.limit === undefined ? false : Number(req.query.limit) || false;

      await getLogEntries(userData._id, from, to, limit, (err, data) => {
        if(err){
          throw new Error(`Failed to retrieve log entries for ${userData.username}`, {cause: err});
        }

        res.json({
          username: userData.username,
          count: data.length,
          _id: userData._id,
          log: data
        });
        next();
      })
    })
  } catch (error) {
    handleError(res, error, next);
  }
}


//models
const createUser = async (username, done) =>{
  try {
    const user = new User({username: username})
    await user.save().then(
      userData => {
        if(!userData){
          throw new Error('User creation executed but did not return new record');
        }
        return done(null, userData);
      }
    ).catch(
      e => {throw new Error('User creation failed on execution.',{cause: e})}
    );
  } catch (error) {
    return done(error);
  }
};

const getUser = async (userId, done) =>{
  try {
    await User.findById(userId).then(
      data => done(null, data)
    ).catch(
      err => {throw new Error('Unable to locate specified user',{cause: err});
      }
    );
  } catch (error) {
    return done(error);
  }
};

const getAllUsers = async (done) =>{
  try {
    const userList = [];
    for await (const user of User.find()){
      userList.push(user);
    }
    done(null,userList);
    
  } catch (error) {
    return done(error);
  }
};

const createLogEntry = async (userId, description, duration, date, done) =>{
  try {
    const entry = new Entry({
      refId: userId,
      date: date === undefined ? new Date() : new Date(date),
      description: description,
      duration: Number(duration)
    })
    await entry.save().then(
      data => done(null,data)
    ).catch(
      err=>{throw new Error('failed to create log entry', {cause: err});}
    );
  } catch (error) {
    return done(error);    
  }
};

const getLogEntries = async (userId, from, to, limit, done) => {
  try {
    let query = Entry.find({refId: userId});
    if(from){query = query.gte('date', from);}
    if(to){query = query.lte('date', to);}
    if(limit){query = query.limit(limit);}
    query = query.sort('date').select('description duration date');
    const logs = [];
    for await(const log of query){
      logs.push({
        description: log.description,
        duration: log.duration,
        date: log.date.toDateString(),
      });
    }
    
    done(null, logs)
  } catch (error) {
    return done(error);
  }
};

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


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
