import dotenv from "dotenv"
import connectDB from "./db/index.js";
import {app} from "./app.js"
dotenv.config()



connectDB().then(()=>{
    app.on("error", (error)=>{
            console.log("ERR: ", error);
            throw error;
           })
    app.listen(process.env.PORT || 8000, ()=>{
        console.log(`server is listening on port ${process.env.PORT}`)
    })
}).catch((err)=>{
    console.log("MONGO db connection failed", err)
})










// import express from "express"
// const app = express()

// ;(async ()=>{
//    try {
//        await mongoose.connect('${process.env.MONGODB_URI}/${DB_NAME}')
//        app.on("error", (error)=>{
//         console.log("ERR: ", error);
//         throw error;
//        })
//        app.listen(process.env.PORT, ()=>{
//         console.log("app is listeing ")

//        })
//    } catch (error) {
//         console.log("ERROR", error);
//         throw err
//    } 
// })()