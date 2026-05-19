import { Router } from "express";
import { changeCurrentPassword, getCurrentUser, loginUser, logOut, refreshAccessToken, registerUser, updateAccountDetails, updateUserAvatar } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(upload.fields(
    [
        { name: "avatar", maxCount: 1 },
        { name: "coverImage", maxCount: 1 }
    ]
) , registerUser)


router.route("/login").post(upload.none(),loginUser)

//secured routes
router.route("/logout").post(verifyJWT, logOut)

router.route("/refresh-token").post(refreshAccessToken)

router.route("/change-password").post(verifyJWT, changeCurrentPassword)

router.route("/get-current-user").get(verifyJWT, getCurrentUser)

router.route("/update-account").patch(verifyJWT, updateAccountDetails)

router.route("/update-avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar)

router.route("/update-cover-image").patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage)

router.route("/channel-profile/:channelId").get(getUserChannelProfile)

router.route("/watch-history").get(verifyJWT, getWatchHistory)

export default router;