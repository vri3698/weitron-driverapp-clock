// Returns the VAPID public key so the frontend can subscribe to push
export const handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY }),
});
