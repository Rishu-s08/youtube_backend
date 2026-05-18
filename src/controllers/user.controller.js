import {asyncHandler} from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {User} from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { access } from 'fs';

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
    // const coverImageLocalPath = req.files?.coverImage[0]?.path 

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar image is required")
    }
    console.log("coverImageLocalPath", coverImageLocalPath)
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


const loginUser = asyncHandler(
    async (req, res) => {
        // 1. get the data from req.body
        // 2. validate the data
        // 3. check if user exists with the provided email or username
        // 4. if user exists compare the password
        // 5. if password matchs generate access and refresh token
        // 6. send cookies

        const {email, username, password} = req.body

        if(!(email || username)){
            throw new ApiError(400, "Email or username is required")
        }
        if(!password){
            throw new ApiError(400, "Password is required")
        }

        const user = await User.findOne({
            $or : [{email}, {username}]
        })

        if(!user){
            throw new ApiError(404, "User not found")
        }

        const isPasswordMatch = await user.isPasswordMatch(password)

        if(!isPasswordMatch){
            throw new ApiError(400, "invalid creds") 
        }

        const {accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id) 

        const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

        const options = {  /// now cokoies is only modifiable on the server side
            httpOnly : true,
            secure: true,
        }

        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser, accessToken, refreshToken
                },
                "User logged in succesfully"
            )
        )
    })

const logOut = asyncHandler(async (req, res) => {
    const userId = req.user._id

    const user = await User.findByIdAndUpdate(userId, {$set : { refreshToken : undefined}}, {returnDocument: 'after'}).select("-password -refreshToken");
    console.log(user);

    const options = {
        httpOnly : true,
        secure : true
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(
                200,
                {},
                "User logged out succesfully"
            )
        )
})


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        user.save({validateBeforeSave: false})

        return({accessToken, refreshToken})
    } catch (error) {
        throw new ApiError(500, "something went wrong")
    }
}

export {registerUser, loginUser, logOut}