const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const util = require('util');
const unlinkFile = util.promisify(fs.unlink);

/**
 * Uploads a local file to Cloudinary and deletes the local file afterwards.
 * @param {string} localFilePath - The path to the local file to upload.
 * @param {string} folder - The Cloudinary folder to upload the file to.
 * @returns {Promise<string>} The secure URL of the uploaded image.
 */
const uploadToCloudinary = async (localFilePath, folder = 'quiz_images') => {
    try {
        if (!localFilePath) return null;

        // Upload the file to Cloudinary
        const result = await cloudinary.uploader.upload(localFilePath, {
            folder: folder,
            resource_type: 'auto'
        });

        // Delete the local file after successful upload
        await unlinkFile(localFilePath).catch(err => {
            console.warn(`Failed to delete local file ${localFilePath} after upload:`, err.message);
        });

        return result.secure_url;
    } catch (error) {
        console.error("Cloudinary upload failed:", error);

        // Attempt to delete local file even if upload fails
        if (localFilePath) {
            await unlinkFile(localFilePath).catch(() => { });
        }

        throw new Error('Image upload failed');
    }
};

/**
 * Deletes an image from Cloudinary by its public ID.
 * @param {string} imageUrl - The secure URL of the image to delete.
 */
const deleteFromCloudinary = async (imageUrl) => {
    try {
        if (!imageUrl) return;

        // Extract public ID from the URL
        // URL format: https://res.cloudinary.com/demo/image/upload/v1234567890/folder/image_id.jpg
        const parts = imageUrl.split('/');
        const lastPart = parts[parts.length - 1]; // "image_id.jpg"
        const folderPart = parts[parts.length - 2]; // "folder"
        const publicIdWithExtension = `${folderPart}/${lastPart}`;
        const publicId = publicIdWithExtension.split('.')[0];

        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Cloudinary deletion failed:", error);
    }
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
};
