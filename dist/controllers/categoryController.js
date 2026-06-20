"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.createCategory = exports.getCategories = void 0;
const Category_1 = __importDefault(require("../models/Category"));
const getCategories = async (req, res) => {
    try {
        const categories = await Category_1.default.find().sort({ name: 1 });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const { name, icon, color } = req.body;
        if (!name)
            return res.status(400).json({ message: 'Category name is required' });
        const exists = await Category_1.default.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (exists)
            return res.status(400).json({ message: 'Category already exists' });
        const category = await Category_1.default.create({ name, icon, color });
        res.status(201).json(category);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createCategory = createCategory;
const deleteCategory = async (req, res) => {
    try {
        const category = await Category_1.default.findByIdAndDelete(req.params.id);
        if (!category)
            return res.status(404).json({ message: 'Category not found' });
        res.json({ message: 'Category deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteCategory = deleteCategory;
