import logging
from typing import TypedDict, List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session as DBSession

from app.models import CommunicationDNA, CoachRecommendation, ChallengeHistory, GrowthMetrics
from app.services.memory_service import MemoryService
from app.services.openai_service import OpenAIService, StructuredEvaluation
from langgraph.graph import StateGraph, END

logger = logging.getLogger("jam_analyzer")

# LangGraph state schema definition
class CoachAgentState(TypedDict):
    user_id: str
    session_id: str
    transcript: str
    evaluation: Dict[str, Any]
    voice_metrics: Dict[str, Any]
    face_metrics: Dict[str, Any]
    historical_memories: List[Dict[str, Any]]
    growth_insight: str
    personalized_challenges: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]

class CoachAgent:
    def __init__(self):
        self.memory_service = MemoryService()
        self.openai_service = OpenAIService()
        self.graph = self._build_graph()

    def _retrieve_memories_node(self, state: CoachAgentState) -> CoachAgentState:
        """
        Node 1: Retrieves user's historical speech issues, behaviors, and challenges from Pinecone.
        """
        user_id = state["user_id"]
        logger.info(f"[Agent Node 1] Querying Pinecone memory for user: {user_id}")
        
        # Query semantic vectors for common faults
        query = "Common communication issues, filler words, speech hesitation, or poor eye contact."
        memories = self.memory_service.search_memories(user_id, query, limit=5)
        
        state["historical_memories"] = memories
        return state

    def _evaluate_trends_node(self, state: CoachAgentState) -> CoachAgentState:
        """
        Node 2: Compares current session performance metrics against baseline trends.
        """
        logger.info("[Agent Node 2] Comparing session metrics against history to evaluate trends.")
        eval_data = state["evaluation"]
        memories = state["historical_memories"]
        
        # Check if there are past recordings showing same issues
        has_recurring_fillers = False
        has_recurring_eye_contact = False
        
        current_fillers_count = sum(eval_data.get("filler_word_frequency", {}).values())
        
        for m in memories:
            text = m.get("text", "").lower()
            if "filler" in text or "um" in text:
                has_recurring_fillers = True
            if "eye contact" in text or "gaze" in text:
                has_recurring_eye_contact = True
                
        insight = "Solid baseline performance."
        if current_fillers_count > 4 and has_recurring_fillers:
            insight = "Warning: High filler word usage is a persistent issue across multiple sessions. Focus on transition pauses."
        elif eval_data.get("eye_contact", 0) < 60 and has_recurring_eye_contact:
            insight = "Warning: Eye contact is consistently low. Practice focusing on the lens dot exercise."
            
        state["growth_insight"] = insight
        return state

    def _formulate_challenges_node(self, state: CoachAgentState) -> CoachAgentState:
        """
        Node 3: Dynamically constructs custom practice challenges and mentor plans.
        """
        logger.info("[Agent Node 3] Formulating custom verbal challenges based on weaknesses.")
        eval_data = state["evaluation"]
        weaknesses = eval_data.get("weaknesses", [])
        
        challenges = []
        recommendations = []
        
        # Match weaknesses to tailored prompts
        for idx, w in enumerate(weaknesses):
            w_lower = w.lower()
            if "story" in w_lower or "narrat" in w_lower:
                challenges.append({
                    "challenge_type": "storytelling",
                    "prompt": "Narrate your favorite childhood memory in exactly 2 minutes, using sensory descriptions and structural resolution (STAR method)."
                })
                recommendations.append({
                    "weakness": w,
                    "suggestion": "Read articles on structural storytelling or the STAR framework. Deliver structured narrative."
                })
            elif "confidence" in w_lower or "hesitat" in w_lower or "filler" in w_lower:
                challenges.append({
                    "challenge_type": "confidence",
                    "prompt": "Defend an unpopular opinion (e.g. 'Social media should be blocked on weekends') without using any filler vocalizations."
                })
                recommendations.append({
                    "weakness": w,
                    "suggestion": "Play the 'Pause Game': clamp your mouth shut for 1 second whenever a filler word comes."
                })
            elif "lead" in w_lower or "conflict" in w_lower:
                challenges.append({
                    "challenge_type": "leadership",
                    "prompt": "Lead a mock team meeting addressing a critical bug delay. Convince stakeholders about the recovery plan."
                })
                recommendations.append({
                    "weakness": w,
                    "suggestion": "Practice project status roundups with crisp, action-oriented directives."
                })
            elif "persua" in w_lower or "pitch" in w_lower:
                challenges.append({
                    "challenge_type": "persuasion",
                    "prompt": "Convince a customer to buy a generic paperclip for $100. Focus on emotional framing and value propositions."
                })
                recommendations.append({
                    "weakness": w,
                    "suggestion": "Adopt benefit-driven features mapping rather than listing technical points."
                })
                
        # Default fallback challenge if no match
        if not challenges:
            challenges.append({
                "challenge_type": "vocabulary",
                "prompt": "Explain how a refrigerator works using simple, non-technical words. Keep it highly fluent and engaging."
            })
            recommendations.append({
                "weakness": "General vocabulary clarity",
                "suggestion": "Practice speaking on simple objects using analogies and simple metaphors."
            })
            
        state["personalized_challenges"] = challenges
        state["recommendations"] = recommendations
        return state

    def _build_graph(self) -> StateGraph:
        """
        Builds the LangGraph state graph.
        """
        workflow = StateGraph(CoachAgentState)
        
        workflow.add_node("retrieve_memories", self._retrieve_memories_node)
        workflow.add_node("evaluate_trends", self._evaluate_trends_node)
        workflow.add_node("formulate_challenges", self._formulate_challenges_node)
        
        workflow.set_entry_point("retrieve_memories")
        workflow.add_edge("retrieve_memories", "evaluate_trends")
        workflow.add_edge("evaluate_trends", "formulate_challenges")
        workflow.add_edge("formulate_challenges", END)
        
        return workflow.compile()

    def run_coaching_workflow(self, db: DBSession, user_id: str, session_id: str, 
                              transcript: str, evaluation: StructuredEvaluation,
                              voice_metrics: Dict[str, Any], face_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs the full LangGraph agent workflow and persists all evolved data structures in PostgreSQL.
        """
        logger.info(f"Triggering LangGraph agent pipeline for session: {session_id}")
        
        # Conforming evaluation Pydantic structure to dict
        eval_dict = evaluation.model_dump()
        
        initial_state: CoachAgentState = {
            "user_id": user_id,
            "session_id": session_id,
            "transcript": transcript,
            "evaluation": eval_dict,
            "voice_metrics": voice_metrics,
            "face_metrics": face_metrics,
            "historical_memories": [],
            "growth_insight": "",
            "personalized_challenges": [],
            "recommendations": []
        }
        
        # Execute Graph
        final_state = self.graph.invoke(initial_state)
        
        # 1. Save Evolved Communication DNA to Database
        dna_record = CommunicationDNA(
            user_id=user_id,
            session_id=session_id,
            confidence=eval_dict.get("confidence", 70),
            fluency=eval_dict.get("fluency", 70),
            vocabulary=eval_dict.get("vocabulary", 70),
            storytelling=eval_dict.get("storytelling", 70),
            leadership=eval_dict.get("leadership", 70),
            persuasion=eval_dict.get("persuasion", 70),
            emotional_intelligence=eval_dict.get("emotional_intelligence", 70),
            clarity=eval_dict.get("clarity", 70),
            energy_level=eval_dict.get("energy_level", 70),
            speaking_speed=eval_dict.get("speaking_speed", 70),
            eye_contact=eval_dict.get("eye_contact", 70),
            posture=eval_dict.get("posture", 70),
            engagement=eval_dict.get("engagement", 70),
            filler_words=eval_dict.get("filler_words", 70),
            profile_summary=eval_dict.get("profile_summary", "Analytical Thinker"),
            filler_word_frequency=eval_dict.get("filler_word_frequency", {})
        )
        db.add(dna_record)

        # 2. Add Growth timeline records
        for key in ["confidence", "fluency", "vocabulary", "storytelling", "leadership", "persuasion", "engagement"]:
            score = eval_dict.get(key, 70)
            growth_entry = GrowthMetrics(
                user_id=user_id,
                metric_type=key,
                score_value=score
            )
            db.add(growth_entry)
            
        # 3. Save Coach Recommendations & Challenges to Database
        for rec in final_state["recommendations"]:
            challenge_obj = None
            # Find challenge matching the type
            matching_challenge = next((ch for ch in final_state["personalized_challenges"] if ch["challenge_type"] in rec["weakness"].lower()), None)
            
            challenge_id = None
            if matching_challenge:
                db_challenge = ChallengeHistory(
                    user_id=user_id,
                    challenge_type=matching_challenge["challenge_type"],
                    prompt=matching_challenge["prompt"]
                )
                db.add(db_challenge)
                db.flush() # populate ID
                challenge_id = db_challenge.id
                
            coach_rec = CoachRecommendation(
                user_id=user_id,
                weakness_identified=rec["weakness"],
                suggestion=rec["suggestion"],
                recommended_challenge_id=challenge_id
            )
            db.add(coach_rec)

        db.commit()

        # 4. Store memory in Vector Database (Pinecone)
        summary_text = (
            f"Candidate completed session {session_id} on topic '{eval_dict.get('expected_answer')[:60]}'. "
            f"Profile Classification: '{eval_dict.get('profile_summary')}'. "
            f"Strengths: {', '.join(eval_dict.get('strengths', []))}. "
            f"Weaknesses: {', '.join(eval_dict.get('weaknesses', []))}. "
            f"Mentor insight: {final_state['growth_insight']}"
        )
        
        self.memory_service.store_memory(
            user_id=user_id,
            memory_id=session_id,
            text=summary_text,
            metadata={
                "session_type": eval_dict.get("final_verdict", "Average"),
                "date": datetime.utcnow().strftime("%Y-%m-%d")
            }
        )

        return {
            "insight": final_state["growth_insight"],
            "challenges": final_state["personalized_challenges"],
            "recommendations": final_state["recommendations"]
        }
