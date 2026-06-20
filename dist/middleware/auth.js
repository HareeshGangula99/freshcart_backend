import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
export const protect = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'User does not have the required permissions' });
        }
        if (req.user.status === 'PENDING') {
            return res.status(403).json({ message: 'Account pending approval' });
        }
        next();
    };
};
