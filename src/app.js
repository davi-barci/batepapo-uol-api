import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from 'joi';
import dayjs from "dayjs";
import { stripHtml } from 'string-strip-html';

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

    if (req.body.name) req.body.name = stripHtml(req.body.name).result.trim();

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

app.post("/messages", async (req, res) => {
    const user = req.headers.user;
    const { to, text, type } = req.body;

    if (!user) res.sendStatus(422);

    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required()
    });

    const validation = messageSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const resp = await db.collection("participants").findOne({ name: user });

        if (!resp) return res.status(422).send("Este usuário não está online/cadastrado!");

        await db.collection("messages").insertOne({
            from: stripHtml(user).result.trim(), 
            to: stripHtml(to).result.trim(), 
            text: stripHtml(text).result.trim(), 
            type: stripHtml(type).result.trim(), 
            time: dayjs().format('HH:mm:ss')
        });

        return res.sendStatus(201);
    } catch (err) {
        return res.status(500).send(err.message);
    }
});

app.get("/messages", async (req, res) => {
    const user = req.headers.user;
    const limit = req.query.limit;

    if (limit && (limit <= 0 || isNaN(limit))){
        return res.sendStatus(422);
    }

    try{
        const messages = await db.collection("messages").find({ $or: [ {to: "Todos"}, { to: user }, {from: user}, { type: "message" } ] } ).toArray();
        if (limit){
            return res.status(200).send(messages.slice(-limit));
        }
        return res.status(200).send(messages);
    }catch (err){
        return res.status(500).send(err.message);
    }
});

app.post("/status", async(req, res) => {
    const user = req.headers.user;
    if (!user) res.sendStatus(404);

    try{
        const resp = await db.collection("participants").findOne({ name: user });
        if (!resp) return res.sendStatus(404);

        await db.collection('participants').updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
        res.sendStatus(200);
    } catch (err){
        return res.status(500).send(err.message);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const user = req.headers.user;
    if (!user) res.sendStatus(404);
	
    try {
		const mensagem = await db.collection("messages").findOne({ _id: new ObjectId(id) });
        if (!mensagem) return res.sendStatus(404);

        if (mensagem.from !== user) return res.sendStatus(401);

        await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
		return res.status(204).send("Messagem deletada com sucesso");
	 } catch (error) {
	  res.status(500).send(error);
	 }
});

app.put("/messages/:id", async (req, res) => {
    const { id } = req.params
    const user = req.headers.user;
    const { to, text, type } = req.body;

    if (!user) res.sendStatus(422);

    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message', 'private_message').required()
    });

    const validation = messageSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const resp = await db.collection("participants").findOne({ name: user });

        if (!resp) return res.status(422).send("Este usuário não está online/cadastrado!");

        const mensagem = await db.collection("messages").findOne({ _id: new ObjectId(id) });
        if (!mensagem) return res.sendStatus(404);

        if (mensagem.from !== user) return res.sendStatus(401);

        await db.collection("messages").updateOne({ _id: new ObjectId(id) }, 
        { $set: {
            from: stripHtml(user).result.trim(), 
            to: stripHtml(to).result.trim(), 
            text: stripHtml(text).result.trim(), 
            type: stripHtml(type).result.trim(), 
            time: dayjs().format('HH:mm:ss')
        } })
        return res.sendStatus(200);
    } catch (err) {
        return res.status(500).send(err.message);
    }
});

setInterval(async () => {
    try {
        const participants = await db.collection('participants').find({ lastStatus: { $lte: Date.now() - 10000 } }).toArray();
            
        participants.forEach(async (participant) => {
            await db.collection('messages').insertOne({from: participant.name, to: "Todos", text: "sai da sala...", type: "status", time: dayjs().format('HH:mm:ss') });
            await db.collection('participants').deleteOne({ name: participant.name });
        });

    } catch (err){
        return res.status(500).send(err.message);
    }
}, 15000);

const PORT = 5000
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))