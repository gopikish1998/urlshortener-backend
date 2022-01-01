const express = require('express');
const app = express();
const cors = require('cors');
const mongodb = require('mongodb');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoClient = mongodb.MongoClient;
const dotenv = require('dotenv');
dotenv.config()
const url = process.env.DB;
const PORT = process.env.PORT || 4000;
app.listen(PORT,console.log(`Listening to port ${PORT}`));
const nodemailer=require("nodemailer")
var shortid = require('shortid');

app.use(cors({
    origin: "*"
}))

app.use(express.json());
function authenticate(req, res, next) {
    try {
    // Check if the token is present
    // if present -> check if it is valid
    if(req.headers.authorization){
        jwt.verify(req.headers.authorization,process.env.JWT2,function(error,decoded){
            if(error){
                res.status(500).json({
                    message: "Unauthorized"
                })
            }else{
                // console.log(decoded)
                req.userid = decoded.id;
                next()
            }
            
        });
      
    }else{
        res.status(401).json({
            message: "No Token Present"
        })
    }
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Internal Server Error"
        })
    }
    
}

app.get('/geturls',[authenticate],async function(req,res){
    try { 
        let client = await mongoClient.connect(url)
        let db = client.db("test2");
        let data = await db.collection('urls').find({},{userid:req.userid}).toArray();
        console.log(data)
        res.json(data)
    } catch (error) {
        res.json({error})
    }
})
app.delete('/delete/:id',[authenticate],async function(req,res){
    try {
        let client = await mongoClient.connect(url)
        let db = client.db("test2");
        let data = await db.collection('urls').findOneAndDelete({_id:mongodb.ObjectId(req.params.id),userid:req.userid})
        await client,close();
        res.json({
            message:'url deleted'
        })
    } catch (error) {
        res.json(error)
    }
})
app.get('/:shortid',async function (req,res){
    try {
        let client = await mongoClient.connect(url)
        let db = client.db("test2");
        let data = await db.collection('urls').findOne({short:req.params.shortid})
        await db.collection('urls').findOneAndUpdate({short:req.params.shortid},{$inc:{clicks:1}})
        await client.close()
        res.redirect(data.url);

    } catch (error) {
        res.json(error)
    }
})
app.post('/url',[authenticate],async function(req,res){
    try {
        let client = await mongoClient.connect(url)
        req.body.userid = req.userid;
        req.body.short = shortid.generate();
        req.body.clicks =0;
        let db = client.db("test2");
        let data = await db.collection('urls').insertOne(req.body)
        await db.client.close()

    } catch (error) {
        res.json({
            error
        })
    }
})
app.get("/confirm/:token",async function(req,res){
    try {
        jwt.verify(req.params.token,process.env.JWT_SECRET,async function(error,decoded){
            let client = await mongoClient.connect(url)
            let db = client.db("test2");
            let user = await db.collection("users").findOne({_id:mongodb.ObjectId(decoded.id)});
           
            if(user){
                await db.collection("users").findOneAndUpdate({_id:mongodb.ObjectId(decoded.id)},{$set:{verified:true}});
                res.json({
                    message:"Email confirmed"
                })
            }            
            else{
                res.json({
                    message:"Wrong token"
                })
            }
        })
    } catch (error) {
        
    }
})
app.post('/register', async function (req,res){
    try {
        let client = await mongoClient.connect(url)

        // Select the DB
        let db = client.db("test2");

        // Hash the password
        let salt = bcryptjs.genSaltSync(10);
        let hash = bcryptjs.hashSync(req.body.password, salt)
        req.body.password = hash;
        req.body.verified=false;
        // Select the Collection and perform the action
        let email = await db.collection("users").findOne({email:req.body.email});

        if(email){
            await client.close();
            console.log("User Exists")
            res.json({
                message:"User already exists"
            })
        }
        else{
        let data = await db.collection("users").insertOne(req.body)
        // Close the Connection
        await client.close();
        let token = jwt.sign({ id: data.insertedId }, process.env.JWT_SECRET)
        // console.log(data.insertedId)
        let transporter = nodemailer.createTransport({
            service:"hotmail",
            auth: {
              user: process.env.user, 
              pass: process.env.pass,
            }})
            let url = `${process.env.host}/confirm/${token}`
            await transporter.sendMail({
            from:process.env.user,
            to:req.body.email,
            subject:"Confirm Email!",
            html:`<h1>Hey there!</h1>
            Verify your account for Recipe-app: <a href=${url}>${url}</a>`
        })
        console.log("Email sent")
        res.json({
            message: "Confirmation Email Sent",
            id: data._id
        })}
    } catch (error) {
        console.log(error)
    }
})
app.post("/login",async function(req,res){
    try {
        // Connect the Database
        let client = await mongoClient.connect(url)

        // Select the DB
        let db = client.db("test2");

        // Find the user with email_id
        let user = await db.collection("users").findOne({ email: req.body.email });

        if (user.verified) {
            // Hash the incoming password
            // Compare that password with user's password
            // console.log(req.body)
            // console.log(user.password)
            let matchPassword = bcryptjs.compareSync(req.body.password, user.password)
            if (matchPassword) {
                // Generate JWT token
                let token = jwt.sign({ id: user._id }, process.env.JWT2)
                res.json({
                    message: true,
                    token,
                    user
                })
            } else {
                res.status(404).json({
                    message: "Username/Password is incorrect"
                })
            }
            // if both are correct then allow them
        } else {
            res.status(404).json({
                message: "Username/Password is incorrect"
            })
        }
    } catch (error) {
        console.log(error)
    }

})
app.put('/setpassword',async function(req,res){
    try {
        let client=await mongoClient.connect(url);
        let db = await client.db("test2");
        let salt = bcryptjs.genSaltSync(10);
        let hash = bcryptjs.hashSync(req.body.password, salt)
        req.body.password = hash;
        let user = await db.collection("users").findOne({email:req.body.email,forgot:true});
        console.log(user)
        if(user){
        await db.collection("users").findOneAndUpdate({email:req.body.email,forgot:true},{$set:{password:req.body.password,forgot:false}});
        client.close();
        res.json({
            message:true
        })
        }
        else{
            res.json({
                message:false
            })
        }
        
        
    } catch (error) {
        res.json("Either reset email not verified or user not found")
    }
})
app.get('/reset/:token',async function(req,res){
    try {
        jwt.verify(req.params.token,process.env.JWT_SECRET,async function(error,decoded){
            let client = await mongoClient.connect(url)
            let db = client.db("test2");
            let user = await db.collection("users").findOne({_id:mongodb.ObjectId(decoded.id)});
           
            if(user){
                await db.collection("users").findOneAndUpdate({_id:mongodb.ObjectId(decoded.id)},{$set:{forgot:true}});
                res.redirect(`${process.env.fronthost}/reset`)
            }            
            else{
                res.json({
                    message:"Wrong token"
                })
            }
        })
    } catch (error) {
        console.log(error)
    }
})
app.post('/forgot',async function(req,res){
    try {
        let client = await mongoClient.connect(url)

        // Select the DB
        let db = client.db("test2");
        let email = await db.collection("users").findOne({email:req.body.email});
        if(!email){
            await client.close();
            // console.log("User not Exists")
            res.json({
                message:false
            })
        }
        else{
            console.log(email)
            let token = jwt.sign({ id: email._id }, process.env.JWT_SECRET)
        let data = await db.collection("users").findOneAndUpdate({email:req.body.email},{$set:{token,forgot:false}})
        // Close the Connection
        await client.close();
        
        // console.log(data.insertedId)
        let transporter = nodemailer.createTransport({
            service:"hotmail",
            auth: {
              user: process.env.user, 
              pass: process.env.pass,
            }})
            let url = `${process.env.host}/reset/${token}`
            await transporter.sendMail({
            from:process.env.user,
            to:req.body.email,
            subject:"Reset Password!",
            html:`<h1>Hey there!</h1>
            Forgot password? Reset here: <a href=${url}>${url}</a>`
        })
        console.log("Email sent")
        res.json({
            message: true
        })}
    } catch (error) {
        console.log(error)
    }
})
