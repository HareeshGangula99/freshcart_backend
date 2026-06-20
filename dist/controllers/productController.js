"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.updateStock = exports.updateProduct = exports.createProduct = exports.getProductById = exports.getProducts = exports.getCategories = void 0;
const Product_1 = __importDefault(require("../models/Product"));
const redis_1 = __importDefault(require("../config/redis"));
const CACHE_TTL = 60;
const PRODUCTS_KEY = 'products:all';
const CATEGORIES_KEY = 'categories:all';
async function invalidateProductCache() {
    try {
        const keys = await redis_1.default.keys('products:*');
        const catKeys = await redis_1.default.keys('categories:*');
        const allKeys = [...keys, ...catKeys];
        if (allKeys.length > 0)
            await redis_1.default.del(...allKeys);
    }
    catch { }
}
const getCategories = async (req, res) => {
    try {
        const cached = await redis_1.default.get(CATEGORIES_KEY);
        if (cached)
            return res.json(cached);
        const categoriesFromField = await Product_1.default.distinct('category');
        const categoriesFromArray = await Product_1.default.distinct('categories');
        const allCategories = [...new Set([...categoriesFromField, ...categoriesFromArray].filter(Boolean))];
        await redis_1.default.set(CATEGORIES_KEY, allCategories, { ex: CACHE_TTL * 2 });
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
        const cacheKey = `products:${category || 'all'}:${search || ''}:${pageNum}:${limitNum}`;
        const cached = await redis_1.default.get(cacheKey);
        if (cached)
            return res.json(cached);
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
        const result = {
            products,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
        };
        await redis_1.default.set(cacheKey, result, { ex: CACHE_TTL });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getProducts = getProducts;
const getProductById = async (req, res) => {
    try {
        const cacheKey = `product:${req.params.id}`;
        const cached = await redis_1.default.get(cacheKey);
        if (cached)
            return res.json(cached);
        const product = await Product_1.default.findById(req.params.id);
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        await redis_1.default.set(cacheKey, product, { ex: CACHE_TTL });
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
        await invalidateProductCache();
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
        await invalidateProductCache();
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
        await invalidateProductCache();
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
        await invalidateProductCache();
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteProduct = deleteProduct;
