"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeliveryPartners = exports.createDeliveryPartner = exports.approveUser = exports.getPendingApprovals = void 0;
const User_1 = __importStar(require("../models/User"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const getPendingApprovals = async (req, res) => {
    try {
        const users = await User_1.default.find({ status: User_1.UserStatus.PENDING });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPendingApprovals = getPendingApprovals;
const approveUser = async (req, res) => {
    try {
        const user = await User_1.default.findByIdAndUpdate(req.params.id, { status: User_1.UserStatus.APPROVED }, { returnDocument: 'after' });
        res.json({ message: 'User approved', user });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.approveUser = approveUser;
const createDeliveryPartner = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const partner = await User_1.default.create({
            name,
            email,
            password: hashedPassword,
            phone,
            role: User_1.UserRole.DELIVERY_PARTNER,
            status: User_1.UserStatus.APPROVED,
        });
        res.status(201).json({ message: 'Delivery partner created', partner });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createDeliveryPartner = createDeliveryPartner;
// ✅ New: Get all approved delivery partners (for manager dispatch dropdown)
const getDeliveryPartners = async (req, res) => {
    try {
        const partners = await User_1.default.find({
            role: User_1.UserRole.DELIVERY_PARTNER,
            status: User_1.UserStatus.APPROVED,
        }).select('_id name email phone');
        res.json(partners);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getDeliveryPartners = getDeliveryPartners;
