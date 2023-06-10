const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENTS_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const jsonWebToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USERS}:${process.env.DB_PASS}@cluster0.dsd2lyy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const PopularInstructor = client.db("Summer-School").collection("class");
    const userCollection = client.db("Summer-School").collection("user");
    const courseCollection = client.db("Summer-School").collection("course");
    const paymentsCollection = client.db("Summer-School").collection("payments");
    const addClassCollection = client.db("Summer-School").collection("addClass");
    const feedbackCollection = client.db("Summer-School").collection("feedback");

    // create jwt token to secure api
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
      res.send({ token })
    })

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    // admin feedback the instructor why he decline class
    app.post('/feedback', async (req, res) => {
      const course = req.body;
      const result = await feedbackCollection.insertOne(course);
      res.send(result);
    })
    app.get('/feedback', async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    })

   

    // create payments
    app.post('/create-payment', jsonWebToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    app.post('/payments', jsonWebToken, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await courseCollection.deleteMany(query)

      res.send({ insertResult, deleteResult });
    })

    // display my enroll classes in the dashboard ui
    app.get('/payments', jsonWebToken, async (req, res) => {
      const userEmail = req.body.email;
      const result = await paymentsCollection.find({ email: userEmail }).toArray();
      // const result = await paymentsCollection.find().toArray()
      res.send(result)
    })
    // user delete the after payments class
    app.delete('/payments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await paymentsCollection.deleteOne(query);
      res.send(result);
    })


    // insert database user 
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    // get all user in the ui
    app.get('/users', jsonWebToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // delete user by only admin
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // make admin
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);

    })

    // check user admin or not
    app.get('/users/admin/:email', jsonWebToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    //  make instructor 
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);

    })
    // check instructor or not
    app.get('/users/instructor/:email', jsonWebToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'instructor' }
      res.send(result);
    })



    // added course collection to database
    app.post('/course', async (req, res) => {
      const course = req.body;
      const result = await courseCollection.insertOne(course);
      res.send(result);
    })

    // get course by using user email
    app.get('/course', jsonWebToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }
      const userEmail = req.decoded.email;
      if (email !== userEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email };
      const result = await courseCollection.find(query).toArray();
      res.send(result);
    });

    // delete add item by order user
    app.delete('/course/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.deleteOne(query);
      res.send(result);
    })
    // pass data to instructor to admin 
    app.get('/addClasses-admin',jsonWebToken,async(req,res)=>{
      const result=await addClassCollection.find().toArray()
       res.send(result)
    })

    // all about instructor
    // added a class by instructor
    app.post('/addClasses', async (req, res) => {
      const classes = req.body;
      classes.status = 'pending';
      const result = await addClassCollection.insertOne(classes);
      res.send(result);
    })
    // instructor get classes he added from addClasses from database
    app.get('/addClasses', jsonWebToken, async (req, res) => {

      let query = {}
      if (req.query?.email) {
        query = { email: req.query.email }
      }
      const result = await addClassCollection.find(query).toArray()
      res.send(result)
    })

    // instructor update status from pending,approved and denied

    app.put('/updateStatus/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
    
      if (status !== 'approved' && status !== 'denied') {
        return res.status(400).send('Invalid status');
      }
    
      const updatedClass = await addClassCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status } },
        { returnOriginal: false }
      );
    
      if (!updatedClass.value) {
        return res.status(404).send('Class not found');
      }
    
      res.send(updatedClass.value);
    });
    





    // all about home page
    app.get('/classes', async (req, res) => {
      const result = await PopularInstructor.find().toArray()
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('helle there')
})

app.listen(port, () => {
  console.log(`Student do their homework PORT ${port}`);
})
