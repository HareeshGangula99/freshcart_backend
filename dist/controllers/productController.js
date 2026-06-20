"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.updateStock = exports.updateProduct = exports.createProduct = exports.getProductById = exports.getProducts = exports.getCategories = void 0;
const Product_1 = __importDefault(require("../models/Product"));
const getCategories = async (req, res) => {
    try {
        const categoriesFromField = await Product_1.default.distinct('category');
        const categoriesFromArray = await Product_1.default.distinct('categories');
        const allCategories = [...new Set([...categoriesFromField, ...categoriesFromArray].filter(Boolean))];
        res.json(allCategories);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCategories = getCategories;
const getProducts = async (req, res) => {
    try {
        const { category, search, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        let query = {};
        if (category) {
            query.$or = [
                { category: category },
                { categories: { $in: [category] } },
            ];
        }
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.name = { $regex: escaped, $options: 'i' };
        }
        const [products, total] = await Promise.all([
            Product_1.default.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
            Product_1.default.countDocuments(query),
        ]);
        res.json({
            products,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProducts = getProducts;
const getProductById = async (req, res) => {
    try {
        const product = await Product_1.default.findById(req.params.id);
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProductById = getProductById;
const createProduct = async (req, res) => {
    try {
        const productData = {
            ...req.body,
            storeId: req.body.storeId || req.user?.id,
        };
        if (typeof productData.categories === 'string') {
            productData.categories = productData.categories.split(',').map((c) => c.trim()).filter(Boolean);
        }
        if (productData.categories?.length > 0 && !productData.category) {
            productData.category = productData.categories[0];
        }
        const product = await Product_1.default.create(productData);
        res.status(201).json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (typeof updateData.categories === 'string') {
            updateData.categories = updateData.categories.split(',').map((c) => c.trim()).filter(Boolean);
        }
        if (updateData.categories?.length > 0 && !updateData.category) {
            updateData.category = updateData.categories[0];
        }
        const product = await Product_1.default.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateProduct = updateProduct;
const updateStock = async (req, res) => {
    try {
        const { stockQuantity } = req.body;
        const product = await Product_1.default.findByIdAndUpdate(req.params.id, { stockQuantity }, { returnDocument: 'after' });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
exports.updateStock = updateStock;
const deleteProduct = async (req, res) => {
    try {
        const product = await Product_1.default.findByIdAndDelete(req.params.id);
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteProduct = deleteProduct;
