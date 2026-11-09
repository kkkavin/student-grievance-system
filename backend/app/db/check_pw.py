import asyncio
import asyncpg

candidates = [
    'postgres',
    'Admin@123',
    'admin',
    'root',
    'kavin',
    'Kavin',
    'kavin123',
    'Kavin@123',
    '123456',
    'password',
    'Dept@123',
    'Student@123',
    'postgres123',
    'campus',
    'grievance',
]

async def check():
    for pw in candidates:
        try:
            conn = await asyncpg.connect(
                user='postgres',
                password=pw,
                host='127.0.0.1',
                port=5432,
                database='postgres',
                timeout=1.0,
            )
            print(f"FOUND WORKING PASSWORD: '{pw}'")
            await conn.close()
            return pw
        except Exception as e:
            pass
    print("NO WORKING PASSWORD FOUND IN LIST")
    return None

if __name__ == "__main__":
    asyncio.run(check())
