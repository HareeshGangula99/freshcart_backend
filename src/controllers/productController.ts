import { Request, Response } from 'express';
import Product from '../models/Product';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categoriesFromField = await Product.distinct('category');
    const categoriesFromArray = await Product.distinct('categories');
    const allCategories = [...new Set([...categoriesFromField, ...categoriesFromArray].filter(Boolean))];
    res.json(allCategories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    let query: any = {};

    if (category) {
      query.$or = [
        { category: category },
        { categories: { $in: [category] } },
      ];
    }
    if (search) {
      const escaped = (search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.name = { $regex: escaped, $options: 'i' };
    }

    const [products, total] = await Promise.all([
      Product.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      Product.countDocuments(query),
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
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const productData = {
      ...req.body,
      storeId: req.body.storeId || (req as any).user?.id,
    };

    if (typeof productData.categories === 'string') {
      productData.categories = productData.categories.split(',').map((c: string) => c.trim()).filter(Boolean);
    }

    if (productData.categories?.length > 0 && !productData.category) {
      productData.category = productData.categories[0];
    }

    const product = await Product.create(productData);
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const updateData = { ...req.body };

    if (typeof updateData.categories === 'string') {
      updateData.categories = updateData.categories.split(',').map((c: string) => c.trim()).filter(Boolean);
    }

    if (updateData.categories?.length > 0 && !updateData.category) {
      updateData.category = updateData.categories[0];
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateStock = async (req: Request, res: Response) => {
  try {
    const { stockQuantity } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { stockQuantity },
      { returnDocument: 'after' }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
