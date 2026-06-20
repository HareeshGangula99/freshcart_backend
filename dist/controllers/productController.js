import Product from '../models/Product';
export const getCategories = async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const getProducts = async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = {};
        if (category)
            query.category = category;
        if (search)
            query.name = { $regex: search, $options: 'i' };
        const products = await Product.find(query);
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const createProduct = async (req, res) => {
    try {
        const productData = {
            ...req.body,
            storeId: req.body.storeId || req.user?.id,
        };
        if (req.file) {
            productData.imageURL = `/uploads/${req.file.filename}`;
        }
        const product = await Product.create(productData);
        res.status(201).json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
export const updateStock = async (req, res) => {
    try {
        const { stockQuantity } = req.body;
        const product = await Product.findByIdAndUpdate(req.params.id, { stockQuantity }, { new: true });
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
};
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product)
            return res.status(404).json({ message: 'Product not found' });
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
