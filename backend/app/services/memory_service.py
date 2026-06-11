import os
import logging
from typing import List, Dict, Any, Optional
from pinecone import Pinecone
from openai import OpenAI

logger = logging.getLogger("jam_analyzer")

class MemoryService:
    def __init__(self):
        self.pinecone_key = os.getenv("PINECONE_API_KEY")
        self.index_name = os.getenv("PINECONE_INDEX_NAME", "communication-twin")
        self.openai_key = os.getenv("OPENAI_KEY") or os.getenv("OPENAI_API_KEY")
        
        # Initialize Pinecone Client
        if self.pinecone_key:
            try:
                self.pc = Pinecone(api_key=self.pinecone_key)
                # Ensure index is instantiated (assumes index exists or handles connection gracefully)
                self.index = self.pc.Index(self.index_name)
                logger.info(f"Successfully connected to Pinecone index: '{self.index_name}'")
            except Exception as e:
                self.index = None
                logger.error(f"Failed to initialize Pinecone Index connection: {e}")
        else:
            self.index = None
            logger.warning("PINECONE_API_KEY environment variable is not configured. Pinecone service functions will bypass.")
            
        # Initialize OpenAI Client (for vector embeddings)
        if self.openai_key:
            self.openai_client = OpenAI(api_key=self.openai_key)
        else:
            self.openai_client = None
            logger.warning("OPENAI_KEY/OPENAI_API_KEY is not configured. Embedding vector generation will fail.")

    def _get_embedding(self, text: str) -> List[float]:
        """
        Generates 1536-dimensional vector embeddings using OpenAI's text-embedding-3-small model.
        """
        if not self.openai_client:
            raise ValueError("OpenAI client is uninitialized for embedding generation.")
            
        res = self.openai_client.embeddings.create(
            input=[text],
            model="text-embedding-3-small"
        )
        return res.data[0].embedding

    def store_memory(self, user_id: str, memory_id: str, text: str, metadata: Dict[str, Any]):
        """
        Saves a session memory vector to Pinecone under the user's namespace.
        """
        if not self.index:
            logger.warning("Pinecone memory store bypassed: service is not connected.")
            return

        try:
            logger.info(f"Indexing communication twin memory in Pinecone for user: {user_id}")
            vector = self._get_embedding(text)
            
            payload = {
                **metadata,
                "user_id": user_id,
                "text": text
            }
            
            self.index.upsert(
                vectors=[(memory_id, vector, payload)],
                namespace=user_id
            )
            logger.info(f"Successfully stored vector memory '{memory_id}' in Pinecone.")
        except Exception as e:
            logger.error(f"Failed to save vector memory to Pinecone: {e}")

    def search_memories(self, user_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves user session history events matching the semantic criteria of the query.
        """
        if not self.index:
            logger.warning("Pinecone search bypassed: service is not connected.")
            return []

        try:
            logger.info(f"Querying vector database for memories: '{query}' under namespace: {user_id}")
            vector = self._get_embedding(query)
            
            res = self.index.query(
                namespace=user_id,
                vector=vector,
                top_k=limit,
                include_metadata=True
            )
            
            matches = []
            for match in res.matches:
                if match.score > 0.35: # score cutoff threshold
                    matches.append(match.metadata)
                    
            logger.info(f"Vector query returned {len(matches)} relevant matches.")
            return matches
        except Exception as e:
            logger.error(f"Failed to query vector memories from Pinecone: {e}")
            return []
