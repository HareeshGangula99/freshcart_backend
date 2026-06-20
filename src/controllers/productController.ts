import { Request, Response } from 'express';
import Product from '../models/Product';
import redis from '../config/redis';

const CACHE_TTL = 60;
const PRODUCTS_KEY = 'products:all';
const CATEGORIES_KEY = 'categories:all';

async function invalidateProductCache() {
  try {
    const keys = await redis.keys('products:*');
    const catKeys = await redis.keys('categories:*');
    const allKeys = [...keys, ...catKeys];
    if (allKeys.length > 0) await redis.del(...allKeys);
  } catch {}
}

export const getCategories = async (req: Request, res: Response) => {
  try {
    const cached = await redis.get<string[]>(CATEGORIES_KEY);
    if (cached) return res.json(cached);

    const categoriesFromField = await Product.distinct('category');
    const categoriesFromArray = await Product.distinct('categories');
    const allCategories = [...new Set([...categoriesFromField, ...categoriesFromArray].filter(Boolean))];

    await redis.set(CATEGORIES_KEY, allCategories, { ex: CACHE_TTL * 2 });
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

    const cacheKey = `products:${category || 'all'}:${search || ''}:${pageNum}:${limitNum}`;
    const cached = await redis.get<any>(cacheKey);
    if (cached) return res.json(cached);

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

    const result = {
      products,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    };

    await redis.set(cacheKey, result, { ex: CACHE_TTL });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const cacheKey = `product:${req.params.id}`;
    const cached = await redis.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    await redis.set(cacheKey, product, { ex: CACHE_TTL });
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
    await invalidateProductCache();
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
    await invalidateProductCache();
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
    await invalidateProductCache();
    res.json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await invalidateProductCache();
    res.json({ message: 'Product deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
