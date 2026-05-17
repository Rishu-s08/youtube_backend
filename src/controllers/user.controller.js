import {asyncHandler} from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {User} from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const registerUser = asyncHandler(async (req, res)=>{
   // 1. get the data from req.body
    // 2. validate the data
    // check if user already exists
    // check for images check for avatar
    // upload the image to cloudinary
    // create user in db
    //remove password from response
    //check for user creation success and send response
    // return res


    const {fullName, email,username, password} = req.body
    
    if([fullName, email, username, password].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All fields are required")
    }

    const existingUser = await User.findOne({
        $or : [{email}, {username}]
    })
    if(existingUser){
        throw new ApiError(409, "User already exists with the provided email or username")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path
    console.log("file" , req.files)
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar image is required")
    }

    const avatar = await uploadToCloudinary(avatarLocalPath)

    const coverImage = coverImageLocalPath ? await uploadToCloudinary(coverImageLocalPath) : null
    
    if(!avatar){
        throw new ApiError(500, "Failed to upload avatar image")
    }

    const user = await User.create({
        fullName,
        email,
        username : username.toLowerCase(),
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        password,
    })

    const UserCreated = await User.findById(user._id).select("-password -refreshToken");

    if(!UserCreated){
        throw new ApiError(500, "Failed to create user")
    }

    return res.status(201).json(
        new ApiResponse(
            200,
            UserCreated,
            "User registered successfully"
        )
    )
})


export {registerUser}