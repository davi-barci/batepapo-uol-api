import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from 'joi';
import dayjs from "dayjs";

const app = express()

app.use(express.json())
app.use(cors())
dotenv.config()

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
    await mongoClient.connect();
    console.log('MongoDB Connected!');
} catch (err) {
    console.log(err.message);
}

const db = mongoClient.db();

app.post("/participants", async (req, res) => {

    const participantSchema = joi.string().required();

    const validation = participantSchema.validate(req.body.name, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const resp = await db.collection("participants").findOne({ name: req.body.name });
        if (resp) return res.status(409).send("Usuário já cadastrado!");

        await db.collection("participants").insertOne({
            name: req.body.name,
            lastStatus: Date.now()
        });

        await db.collection("messages").insertOne({
            from: req.body.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs().format('HH:mm:ss')
        });
        return res.sendStatus(201);
    } catch (err) {
        return res.status(500).send(err.message);
    }
});

app.get("/participants", async (req, res) => {
    try{
        const participants = await db.collection("participants").find().toArray();
        return res.status(200).send(participants);
    }catch (err){
        return res.status(500).send(err.message);
    }
});

const PORT = 5000
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))