import { Request, Response } from 'express';
import Settings from '../models/Settings';

export const getSettings = async (_req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { handlingFee, gstRate, freeDeliveryAbove, deliveryFee } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    if (handlingFee !== undefined) settings.handlingFee = handlingFee;
    if (gstRate !== undefined) settings.gstRate = gstRate;
    if (freeDeliveryAbove !== undefined) settings.freeDeliveryAbove = freeDeliveryAbove;
    if (deliveryFee !== undefined) settings.deliveryFee = deliveryFee;
    await settings.save();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
