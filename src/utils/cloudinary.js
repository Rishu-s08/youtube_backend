import {v2 as cloudinary} from 'cloudinary'
import fs from "fs"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

const uploadToCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) return null

        //upload file to cloudinary
        const response = await cloudinary.uploader.upload(localFilePath,{
            resource_type: "auto",
        })
        //file uploaded to cloudinary, now remove from local uploads folder
        fs.unlinkSync(localFilePath)
        console.log("file uploaded to cloudinary and removed from local uploads folder", response.url)
        return response 
    } catch (error) {
        //error uploading file to cloudinary, remove file from local uploads folder
        fs.unlinkSync(localFilePath)
        console.log("Error uploading file to cloudinary", error)
        return null
    }
}


export {uploadToCloudinary}