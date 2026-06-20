import mongoose, { Schema } from 'mongoose';
export var UserRole;
(function (UserRole) {
    UserRole["USER"] = "USER";
    UserRole["STORE_MANAGER"] = "STORE_MANAGER";
    UserRole["DELIVERY_PARTNER"] = "DELIVERY_PARTNER";
    UserRole["ADMIN"] = "ADMIN";
})(UserRole || (UserRole = {}));
export var UserStatus;
(function (UserStatus) {
    UserStatus["PENDING"] = "PENDING";
    UserStatus["APPROVED"] = "APPROVED";
    UserStatus["REJECTED"] = "REJECTED";
})(UserStatus || (UserStatus = {}));
const UserSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.APPROVED },
    authProvider: { type: String, enum: ['local', 'google', 'phone'], default: 'local' },
    avatar: { type: String },
    address: {
        street: { type: String },
        city: { type: String },
        zip: { type: String },
    },
    phone: { type: String },
    createdAt: { type: Date, default: Date.now },
});
export default mongoose.model('User', UserSchema);
