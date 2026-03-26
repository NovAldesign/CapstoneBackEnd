import express from 'express';
import Stripe from 'stripe';
import Order from '../models/orderSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @route   POST /api/checkout/create-intent
 * @desc    Create a Stripe PaymentIntent and save a PENDING order
 */
router.post('/create-intent', async (req, res) => {
    try {
        const { 
            eventId, 
            ticketType, 
            quantity, 
            buyerName, 
            buyerEmail, 
            unitPrice 
        } = req.body;

        // 1. Calculate Total (in cents for Stripe)
        const subtotal = unitPrice * quantity;
        const total = subtotal; // Add tax/fees here if needed

        // 2. Create Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: total, 
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: { buyerEmail, eventId, ticketType }
        });

        // 3. Create the Order in MongoDB (Status: Pending)
        const newOrder = new Order({
            event: eventId,
            ticketType,
            quantity,
            buyerName,
            buyerEmail,
            unitPrice,
            subtotal,
            total,
            stripePaymentIntentId: paymentIntent.id,
            stripeClientSecret: paymentIntent.client_secret,
            paymentStatus: 'pending'
        });

        await newOrder.save();

        // 4. Send Client Secret back to Frontend
        res.status(201).json({
            clientSecret: paymentIntent.client_secret,
            orderId: newOrder._id
        });

    } catch (err) {
        console.error("Checkout Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;