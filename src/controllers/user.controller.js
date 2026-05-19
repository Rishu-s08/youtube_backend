import {asyncHandler} from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {User} from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { access } from 'fs';
import jwt from 'jsonwebtoken';
import { subscribe } from 'diagnostics_channel';
import mongoose from 'mongoose';

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

const refreshAccessToken = asyncHandler(async (req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken){
        throw new ApiError(401, "unauthorized request")
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, REFRESH_TOKEN_SECRET);
        const userId = decodedToken?._id;
    
        const user = await User.findById(userId)
        if (!user) {
            throw new ApiError(401, "Invalid refresh Token")
        }
    
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(userId)
        const options = {
            httpOnly : true, 
            secure : true
        }
    
        return res.status(200).cookie("accessToken",accessToken, options).cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "something went wrong")
    }
})

const changeCurrentPassword = asyncHandler(async(req, res) =>{
    const {oldPassword, newPassword1, newPassword2} = req.body

    if(!oldPassword){
        throw new ApiError(400, "Old password is required")
    }
    if(!newPassword1 || !newPassword2){
        throw new ApiError(400, "New passwords are required")
    }
    if(newPassword1 !== newPassword2){
        throw new ApiError(400, "New passwords do not match")
    }

    const user = await User.findById(req.user._id).select("+password")
    console.log("user", user)
    if(!user){
        throw new ApiError(404, "User not found")
    }

    const currentPassword = user?.password;
    const isPasswordMatch = await user.isPasswordMatch(oldPassword)

    if(!isPasswordMatch){
        throw new ApiError(400, "Old password is incorrect")
    }

    user.password = newPassword1;
    await user.save()

    return res.status(200).json(
        new ApiResponse(
            200,{},
            "Password changed successfully"
        )
    )
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200).json(
        new ApiResponse(
            200,
            req.user,
            "User fetched successfully"
        )
    );
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if(!fullName && !email){
        throw new ApiError(400, "At least one field is required to update")
    }

    await User.findByIdAndUpdate(req.user._id, {
        $set :{
            fullName, email
        }
    }, {
        returnDocument: "after"
    }).select("-password")

    return res.status(200).json(
        new ApiResponse(
            200,{}, 
            "Account details updated successfully"
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

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.avatar[0]?.path

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar image is required")
    }

    const avatar = await uploadToCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new ApiError(500, "Failed to upload avatar image")
    }
    const updatedUser = await User.findByIdAndUpdate(req.user._id, {
        $set : {
            avatar : avatar.url
        }
    }, {
        returnDocument: "after"
    }).select("-password -refreshToken")

    return res.status(200).json(
        new ApiResponse(
            200,updatedUser,
            "Avatar updated successfully"
        )
    )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.coverImage[0]?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required")
    }

    const coverImage = await uploadToCloudinary(coverImageLocalPath)
    if (!coverImage.url) {
        throw new ApiError(500, "Failed to upload cover image")
    }
    const updatedUser = await User.findByIdAndUpdate(req.user._id, {
        $set: {
            coverImage: coverImage.url
        }
    }, {
        returnDocument: "after"
    }).select("-password -refreshToken")

    return res.status(200).json(
        new ApiResponse(
            200, updatedUser,
            "Cover image updated successfully"
        )
    )
})


const getUserChannelProfile = asyncHandler(async (req, res) => {

    const {username} = req.params

    if(!username?.trim()){
        throw new ApiError(400, "Username is missing")
    }

    const channel = await User.aggregate([
        {
            $match : {
                username : username?.toLowerCase()
            }
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "channel",
                as : "subscribers"
            }
        }, 
        {
            $lookup :{
                from : "subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as : "subscribedTo"
            }
        },
        {
            $addFields : {
                subscribersCount : {
                    $size : "$subscribers"
                },
                subscribedToCount : {
                    $size : "$subscribedTo"
                },
                isSubscribed : {
                    $cond : {
                        if : { $in : [req.user?._id, "$subscribers.subsriber"]},
                        then : true,
                        else : false 
                    }
                }
            }
        },
        {
            $project : {
                fullName : 1,
                username : 1,
                avatar : 1,
                coverImage : 1,
                subscribersCount : 1,
                subscribedToCount : 1,
                isSubscribed : 1
            }
        }
    ])

    if (!channel?.length){
        throw new ApiError(404, "Channel not found")
    }

    return res.status(200).json(
        new ApiResponse(
            200, channel[0], "Channel profile fetched successfully"
        )
    );


});


const getWatchHistory = asyncHandler(async (req, res) => {

    const user  = await User.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId(req.user._id)
            },
            
        },
        {
            $lookup : {
                from : "videos",
                localField : "watchHistory",
                foreignField : "_id",
                as : "watchHistory",
                pipeline : [
                    {
                        $lookup : {
                            from : "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        fullName : 1,
                                        username : 1,
                                        avatar : 1
                                    }
                                },
                                {
                                    $addFields : {
                                        owner : {
                                            $first : "$owner"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
        

    ])

    return res.status(200).json(
        new ApiResponse(
            200, user[0].watchHistory, "Watch history fetched successfully"
        )
    );

})


export {registerUser, loginUser, logOut, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, getUserChannelProfile,}